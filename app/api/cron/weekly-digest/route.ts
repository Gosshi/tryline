import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";
import { notifyNewsletterDelivery } from "@/lib/llm/notify";
import { sendWeeklyDigestEmails } from "@/lib/newsletter";

export const maxDuration = 60;

type Relation<T> = T | T[] | null;

type TeamRow = {
  name: string | null;
  name_ja: string | null;
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

type MatchEventRow = {
  match_id: string;
  metadata: Record<string, unknown> | null;
  minute: number | null;
  team: Relation<TeamRow>;
  type: string;
};

type SourcedFactRow = {
  fact: string;
  fact_ja: string | null;
  match_id: string;
};

type MatchWithDetails = MatchRow & {
  events: MatchEventRow[];
  sourcedFacts: SourcedFactRow[];
};

const SYSTEM_PROMPT = `あなたはラグビーメディア「Tryline」の日本語編集者です。
提供された先週末の試合データをもとに、購読者へ送るプレーンテキストの週次メール本文を生成してください。

出力形式:
- 本文の1行目は「今週の海外ラグビーまとめ」を含むタイトルにする
- 構成は、タイトル、リード文（2〜3文）、大会ごとの試合結果、締めの案内とする
- 見出しは空行と自然な文言で区切る。見出し用のシャープ、横線、アスタリスクによる強調、角括弧と丸括弧を組み合わせたリンクは使わない
- 各試合に Tryline のレビューURLを「→ https://www.trylinerugby.com/matches/...」のような裸のURLで付ける

制約:
- スコア・選手名・開催地・得点経過・試合後の事実は、すべて提供データのみ使う（推測・捏造厳禁）
- 提供データにない一般知識や背景を補わない
- 語尾は「でした」「です」等の丁寧体で統一
- 数字を出したら、その数字が試合で何を意味したかを、提供された得点経過または試合後の事実に基づいて続ける。スコアの言い換えだけで終わらせない
- 各試合で、得点経過または試合後の事実から少なくとも1つの具体を入れる
- 末尾に「https://www.trylinerugby.com」を裸のURLで入れる`;

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

function formatMatchEvent(event: MatchEventRow): string {
  const team = firstRelation(event.team);
  const teamName = team?.name_ja ?? team?.name ?? "チーム未設定";
  const playerName = event.metadata?.player_name;
  const player = typeof playerName === "string" ? ` ${playerName}` : "";
  const minute = event.minute === null ? "時間不明" : `${event.minute}分`;

  return `${minute}: ${teamName}${player} ${event.type}`;
}

function buildUserPrompt(
  matches: MatchWithDetails[],
  start: Date,
  end: Date,
): string {
  const period = formatPeriod(start, end);
  const matchLines = matches.map((match) => {
    const competition = firstRelation(match.competition);
    const homeTeam = firstRelation(match.home_team);
    const awayTeam = firstRelation(match.away_team);
    const competitionName = competition?.name_ja ?? "大会名未設定";
    const homeName = homeTeam?.name_ja ?? homeTeam?.name ?? "ホーム";
    const awayName = awayTeam?.name_ja ?? awayTeam?.name ?? "アウェイ";
    const eventLines = match.events.map(formatMatchEvent);
    const sourcedFactLines = match.sourcedFacts.map(
      (fact) => fact.fact_ja ?? fact.fact,
    );

    return [
      `大会: ${competitionName}`,
      `${homeName} ${match.home_score}–${match.away_score} ${awayName}`,
      `日付: ${formatJstDateTime(match.kickoff_at)} JST`,
      `レビューURL: https://www.trylinerugby.com/matches/${match.id}`,
      "得点・試合イベント:",
      ...(eventLines.length > 0
        ? eventLines.map((event) => `- ${event}`)
        : ["- なし"]),
      "試合後の事実:",
      ...(sourcedFactLines.length > 0
        ? sourcedFactLines.map((fact) => `- ${fact}`)
        : ["- なし"]),
    ].join("\n");
  });

  return `以下の試合データをもとに、今週末のまとめ原稿を書いてください。

【期間】${period}

【試合結果】
${matchLines.join("\n\n")}`;
}

function assertPlainTextDigest(digest: string): void {
  const violations = [
    ["heading", /(^|\n)\s*#/m],
    ["link", /\[[^\]]+\]\([^\n)]+\)/],
    ["divider", /(^|\n)\s*---+\s*(?=\n|$)/m],
    ["bold", /\*\*[^*]+\*\*/],
  ].flatMap(([name, pattern]) =>
    (pattern as RegExp).test(digest) ? [name] : [],
  );

  if (violations.length > 0) {
    throw new Error(
      `Weekly digest contains prohibited Markdown syntax: ${violations.join(", ")}.`,
    );
  }
}

async function runWeeklyDigest(request: Request) {
  try {
    assertCronAuthorized(request);

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
          home_team:teams!matches_home_team_id_fkey ( name, name_ja ),
          away_team:teams!matches_away_team_id_fkey ( name, name_ja ),
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

    const matchIds = matches.map((match) => match.id);
    const [eventsResult, sourcedFactsResult] = await Promise.all([
      db
        .from("match_events")
        .select(
          "match_id, minute, type, metadata, team:teams!match_events_team_id_fkey(name, name_ja)",
        )
        .in("match_id", matchIds)
        .order("minute", { ascending: true, nullsFirst: false }),
      db
        .from("match_sourced_facts")
        .select("match_id, fact, fact_ja")
        .in("match_id", matchIds)
        .eq("content_type", "recap"),
    ]);

    if (eventsResult.error) {
      throw eventsResult.error;
    }

    if (sourcedFactsResult.error) {
      throw sourcedFactsResult.error;
    }

    const eventsByMatchId = new Map<string, MatchEventRow[]>();
    for (const event of (eventsResult.data ?? []) as MatchEventRow[]) {
      const events = eventsByMatchId.get(event.match_id) ?? [];
      events.push(event);
      eventsByMatchId.set(event.match_id, events);
    }

    const sourcedFactsByMatchId = new Map<string, SourcedFactRow[]>();
    for (const fact of (sourcedFactsResult.data ?? []) as SourcedFactRow[]) {
      const sourcedFacts = sourcedFactsByMatchId.get(fact.match_id) ?? [];
      sourcedFacts.push(fact);
      sourcedFactsByMatchId.set(fact.match_id, sourcedFacts);
    }

    const matchesWithDetails: MatchWithDetails[] = matches.map((match) => ({
      ...match,
      events: eventsByMatchId.get(match.id) ?? [],
      sourcedFacts: sourcedFactsByMatchId.get(match.id) ?? [],
    }));

    const response = await getOpenAIClient().chat.completions.create({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        {
          content: buildUserPrompt(
            matchesWithDetails,
            lastSatStart,
            lastSunEnd,
          ),
          role: "user",
        },
      ],
      model: MODELS.NARRATIVE,
    });
    const digest = response.choices[0]?.message?.content?.trim();

    if (!digest) {
      throw new Error("Weekly digest generation returned empty content.");
    }

    assertPlainTextDigest(digest);

    const newsletter = await sendWeeklyDigestEmails(digest);
    await notifyNewsletterDelivery(newsletter);

    return NextResponse.json({
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
