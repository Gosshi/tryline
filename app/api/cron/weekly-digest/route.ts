import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";
import { notifyNewsletterDelivery } from "@/lib/llm/notify";
import { sendWeeklyDigestEmails } from "@/lib/newsletter";

export const maxDuration = 60;

type Relation<T> = T | T[] | null;

type TeamRow = {
  name: string | null;
};

type CompetitionRow = {
  family: string | null;
  name_ja: string | null;
};

type MatchRow = {
  away_score: number | null;
  away_team: Relation<TeamRow>;
  competition: Relation<CompetitionRow>;
  home_score: number | null;
  home_team: Relation<TeamRow>;
  id: string;
  kickoff_at: string;
};

const SYSTEM_PROMPT = `あなたはラグビーメディア「Tryline」の日本語編集者です。
提供された先週末の試合データをもとに、note.com への投稿原稿を生成してください。

出力形式:
- Markdown形式（# タイトル, ## 見出し, ### 小見出し, **太字**, [text](url) リンク）
- 構成: タイトル → リード文（2〜3文） → 大会別セクション → フッター
- 各試合に Tryline のレビューリンクを「→ [試合レビュー（日本語）](URL)」形式で付ける
- タイトルに「【今週の海外ラグビーまとめ】」を必ず含める。末尾に「（YYYY.M.D–M.D）」の期間を付ける

制約:
- スコア・選手名・開催地は提供データのみ使う（推測・捏造厳禁）
- ラグビー一般知識（チームの特徴、大会説明、ライバル関係）は活用してよい
- 語尾は「でした」「です」等の丁寧体で統一
- 末尾に必ず「👉 [trylinerugby.com](https://www.trylinerugby.com)」を入れる`;

function firstRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function getLastWeekendRange(now = new Date()) {
  const lastSatStart = new Date(now);
  lastSatStart.setUTCDate(now.getUTCDate() - 3);
  lastSatStart.setUTCHours(15, 0, 0, 0);

  const lastSunEnd = new Date(now);
  lastSunEnd.setUTCDate(now.getUTCDate() - 1);
  lastSunEnd.setUTCHours(14, 59, 59, 999);

  return { lastSatStart, lastSunEnd };
}

function formatJstDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(new Date(value));
}

function formatPeriod(start: Date, end: Date): string {
  const startText = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
    weekday: "short",
    year: "numeric",
  }).format(start);
  const endText = new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(end);

  return `${startText}〜 ${endText}`;
}

function buildUserPrompt(matches: MatchRow[], start: Date, end: Date): string {
  const period = formatPeriod(start, end);
  const matchLines = matches.map((match) => {
    const competition = firstRelation(match.competition);
    const homeTeam = firstRelation(match.home_team);
    const awayTeam = firstRelation(match.away_team);
    const competitionName = competition?.name_ja ?? "大会名未設定";
    const homeName = homeTeam?.name ?? "ホーム";
    const awayName = awayTeam?.name ?? "アウェイ";

    return [
      `大会: ${competitionName}`,
      `${homeName} ${match.home_score}–${match.away_score} ${awayName}`,
      `日付: ${formatJstDateTime(match.kickoff_at)} JST`,
      `レビューURL: https://www.trylinerugby.com/matches/${match.id}`,
    ].join("\n");
  });

  return `以下の試合データをもとに、今週末のまとめ原稿を書いてください。

【期間】${period}

【試合結果】
${matchLines.join("\n\n")}`;
}

function splitIntoChunks(text: string, maxLen = 1900): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length > maxLen && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

async function postToDiscord(
  webhookUrl: string,
  content: string,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    body: JSON.stringify({ content }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWeeklyDigest(request: Request) {
  try {
    assertCronAuthorized(request);

    const { DISCORD_WEBHOOK_WEEKLY_DIGEST } = getServerEnv();

    const db = getSupabaseServerClient();
    const { lastSatStart, lastSunEnd } = getLastWeekendRange();
    const { data: rawMatches, error } = await db
      .from("matches")
      .select(
        `
          id,
          home_score,
          away_score,
          kickoff_at,
          home_team:teams!matches_home_team_id_fkey ( name ),
          away_team:teams!matches_away_team_id_fkey ( name ),
          competition:competitions!matches_competition_id_fkey ( family, name_ja )
        `,
      )
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .gte("kickoff_at", lastSatStart.toISOString())
      .lte("kickoff_at", lastSunEnd.toISOString())
      .order("kickoff_at", { ascending: true });

    if (error) {
      throw error;
    }

    const matches = ((rawMatches ?? []) as unknown as MatchRow[]).filter(
      (match) => firstRelation(match.competition)?.family !== "league-one",
    );

    if (matches.length === 0) {
      return NextResponse.json({ matches: 0, skipped: true });
    }

    const response = await getOpenAIClient().chat.completions.create({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        {
          content: buildUserPrompt(matches, lastSatStart, lastSunEnd),
          role: "user",
        },
      ],
      model: MODELS.NARRATIVE,
    });
    const digest = response.choices[0]?.message?.content?.trim();

    if (!digest) {
      throw new Error("Weekly digest generation returned empty content.");
    }

    const chunks = splitIntoChunks(digest);

    if (DISCORD_WEBHOOK_WEEKLY_DIGEST) {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index]!;
        const content =
          index === 0 ? `📋 note 原稿（コピペ用）\n\n${chunk}` : chunk;
        await postToDiscord(DISCORD_WEBHOOK_WEEKLY_DIGEST, content);

        if (index < chunks.length - 1) {
          await sleep(100);
        }
      }
    }

    const newsletter = await sendWeeklyDigestEmails(digest);
    await notifyNewsletterDelivery(newsletter);

    return NextResponse.json({
      chunks: chunks.length,
      ...(DISCORD_WEBHOOK_WEEKLY_DIGEST ? {} : { discord: "skipped" }),
      matches: matches.length,
      newsletter,
      status: "ok",
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const err =
      error instanceof Error
        ? {
            message: error.message,
          }
        : error;
    console.error("[weekly-digest] failed", JSON.stringify(err));

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runWeeklyDigest(request);
}

export async function POST(request: Request) {
  return runWeeklyDigest(request);
}
