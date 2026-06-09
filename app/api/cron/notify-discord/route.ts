import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { getServerEnv } from "@/lib/env";
import { generateImpressionTweet } from "@/lib/x/impression-tweet";
import { buildLinklessReplyText, buildTweetText } from "@/lib/x/post";
import {
  generatePreviewThread,
  type PreviewThread,
} from "@/lib/x/preview-thread";
import { buildOfficialReplyText, type TryScorer } from "@/lib/x/reply-text";

export const maxDuration = 60;

type Relation<T> = T | T[] | null;

type TeamRow = {
  english_name: string | null;
  name: string | null;
};

type CompetitionRow = {
  family: string | null;
  name: string | null;
  season: string | null;
};

type MatchRow = {
  away_score: number | null;
  away_team: Relation<TeamRow>;
  competition: Relation<CompetitionRow>;
  home_score: number | null;
  home_team: Relation<TeamRow>;
  kickoff_at: string;
};

type ContentRow = {
  content_md: string;
  content_type: "preview" | "recap";
  discord_notified_at: string | null;
  id: string;
  language: "ja" | "en";
  match_id: string;
  matches: Relation<MatchRow>;
};

type MatchEventRow = {
  metadata: unknown;
};

type DiscordEmbed = {
  title: string;
  description: string;
  color: number;
  image?: { url: string };
  fields: Array<{
    name: string;
    value: string;
    inline: false;
  }>;
};

type DiscordPayload = {
  embeds: DiscordEmbed[];
};

const DISCORD_FIELD_VALUE_LIMIT = 1024;
const CODE_BLOCK_OVERHEAD = "```\n\n```".length;

function firstRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation;
}

function createRecapExcerpt(markdown: string): string {
  return markdown
    .replace(/^#+\s.+$/gm, "")
    .replace(/[*_`]/g, "")
    .trim()
    .slice(0, 120);
}

function requireDiscordWebhook(
  value: string | undefined,
  name: "DISCORD_WEBHOOK_EN" | "DISCORD_WEBHOOK_JA",
): string {
  if (!value) {
    throw new Error(
      `Missing required Discord webhook environment variable: ${name}`,
    );
  }

  return value;
}

function getPlayerNameFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const playerName = (metadata as { player_name?: unknown }).player_name;
  return typeof playerName === "string" ? playerName.trim() : "";
}

function truncateDiscordCodeBlockValue(text: string): string {
  const maxTextLength = DISCORD_FIELD_VALUE_LIMIT - CODE_BLOCK_OVERHEAD;
  const trimmedText =
    text.length > maxTextLength ? text.slice(0, maxTextLength).trimEnd() : text;

  return `\`\`\`\n${trimmedText}\n\`\`\``;
}

function pushPreviewThreadFields(
  embed: DiscordEmbed,
  thread: PreviewThread,
): void {
  const tweet1 = `🐦 ツイート1\n\`\`\`\n${thread.tweet1}\n\`\`\``;
  const tweet2 = `🐦 ツイート2\n\`\`\`\n${thread.tweet2}\n\`\`\``;
  const tweet3 = `🐦 ツイート3（リプライ）\n\`\`\`\n${thread.tweet3}\n\`\`\``;
  const value = [tweet1, tweet2, tweet3].join("\n\n");

  if (value.length <= DISCORD_FIELD_VALUE_LIMIT) {
    embed.fields.push({
      inline: false,
      name: "⑤ プレビュースレッド案（手動投稿用）",
      value,
    });
    return;
  }

  embed.fields.push(
    {
      inline: false,
      name: "⑤-1 プレビュースレッド案（手動投稿用）",
      value: [tweet1, tweet2].join("\n\n").slice(0, DISCORD_FIELD_VALUE_LIMIT),
    },
    {
      inline: false,
      name: "⑤-2 プレビュースレッド案（手動投稿用）",
      value: tweet3.slice(0, DISCORD_FIELD_VALUE_LIMIT),
    },
  );
}

function appendOfficialReplyFields(
  embed: DiscordEmbed,
  params: {
    awayScore: number;
    awayTeamNameEn: string;
    awayTeamNameJa: string;
    competitionFamily: string | null;
    homeScore: number;
    homeTeamNameEn: string;
    homeTeamNameJa: string;
    tryScorers: TryScorer[];
  },
): void {
  const jaReply = buildOfficialReplyText({
    awayScore: params.awayScore,
    awayTeamName: params.awayTeamNameJa,
    competitionFamily: params.competitionFamily,
    homeScore: params.homeScore,
    homeTeamName: params.homeTeamNameJa,
    language: "ja",
    tryScorers: params.tryScorers,
  });
  const enReply = buildOfficialReplyText({
    awayScore: params.awayScore,
    awayTeamName: params.awayTeamNameEn,
    competitionFamily: params.competitionFamily,
    homeScore: params.homeScore,
    homeTeamName: params.homeTeamNameEn,
    language: "en",
    tryScorers: params.tryScorers,
  });
  embed.fields.push(
    {
      inline: false,
      name: "④ 公式へのリプライ案 🇯🇵",
      value: truncateDiscordCodeBlockValue(jaReply),
    },
    {
      inline: false,
      name: "⑤ 公式へのリプライ案 🇬🇧",
      value: truncateDiscordCodeBlockValue(enReply),
    },
  );
}

async function appendReadingHookTweetField(
  embed: DiscordEmbed,
  params: {
    awayScore: number;
    awayTeamName: string;
    competitionLabel: string;
    homeScore: number;
    homeTeamName: string;
    recapExcerpt: string;
    tryScorers: TryScorer[];
  },
): Promise<void> {
  const readingHookTweet = await generateImpressionTweet(params);
  if (!readingHookTweet) {
    return;
  }

  embed.fields.push({
    inline: false,
    name: "⑥ 読みどころ投稿案（URLなし）",
    value: truncateDiscordCodeBlockValue(readingHookTweet),
  });
}

async function postToDiscord(
  webhookUrl: string,
  payload: DiscordPayload,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
}

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const { DISCORD_WEBHOOK_EN, DISCORD_WEBHOOK_JA } = getServerEnv();
    const db = getSupabaseServerClient();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const selectClause = `
        id,
        match_id,
        content_type,
        language,
        content_md,
        discord_notified_at,
        matches!inner (
          kickoff_at,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey ( name, english_name ),
          away_team:teams!matches_away_team_id_fkey ( name, english_name ),
          competition:competitions!matches_competition_id_fkey ( name, season, family )
        )
      `;

    const [jaResult, enResult] = await Promise.all([
      db
        .from("match_content")
        .select(selectClause)
        .eq("status", "published")
        .eq("language", "ja")
        .in("content_type", ["recap", "preview"])
        .is("discord_notified_at", null)
        .gte("matches.kickoff_at", sevenDaysAgo)
        .order("generated_at", { ascending: true }),
      db
        .from("match_content")
        .select(selectClause)
        .eq("status", "published")
        .eq("language", "en")
        .in("content_type", ["recap", "preview"])
        .is("discord_notified_at", null)
        .gte("matches.kickoff_at", sevenDaysAgo)
        .order("generated_at", { ascending: true }),
    ]);

    if (jaResult.error) {
      throw jaResult.error;
    }

    if (enResult.error) {
      throw enResult.error;
    }

    const data = [...(jaResult.data ?? []), ...(enResult.data ?? [])];
    const results: Array<{ language: "ja" | "en"; matchId: string }> = [];

    for (const content of data as unknown as ContentRow[]) {
      const match = firstRelation(content.matches);
      if (!match) {
        continue;
      }

      const now = new Date().toISOString();

      if (content.content_type === "preview" && match.kickoff_at < now) {
        const { error: updateError } = await db
          .from("match_content")
          .update({ discord_notified_at: now })
          .eq("id", content.id);

        if (updateError) {
          throw updateError;
        }

        continue;
      }

      const homeTeam = firstRelation(match.home_team);
      const awayTeam = firstRelation(match.away_team);
      const competition = firstRelation(match.competition);
      const competitionLabel = competition?.name ?? "";
      const homeDisplayName =
        content.language === "en"
          ? (homeTeam?.english_name ?? homeTeam?.name ?? "Home")
          : (homeTeam?.name ?? "Home");
      const awayDisplayName =
        content.language === "en"
          ? (awayTeam?.english_name ?? awayTeam?.name ?? "Away")
          : (awayTeam?.name ?? "Away");
      let tryScorers: TryScorer[] = [];

      if (content.content_type === "recap") {
        const { data: events, error: eventsError } = await db
          .from("match_events")
          .select("metadata")
          .eq("match_id", content.match_id)
          .eq("type", "try");

        if (eventsError) {
          throw eventsError;
        }

        const scorerMap = new Map<string, number>();
        for (const event of (events ?? []) as MatchEventRow[]) {
          const playerName = getPlayerNameFromMetadata(event.metadata);
          if (playerName) {
            scorerMap.set(playerName, (scorerMap.get(playerName) ?? 0) + 1);
          }
        }
        tryScorers = [...scorerMap.entries()]
          .map(([playerName, count]) => ({ count, playerName }))
          .sort(
            (a, b) =>
              b.count - a.count || a.playerName.localeCompare(b.playerName),
          );
      }
      const score =
        match.home_score !== null && match.away_score !== null
          ? `${match.home_score} - ${match.away_score}`
          : "vs";
      const typeLabel =
        content.content_type === "preview"
          ? content.language === "en"
            ? "📋 Preview"
            : "📋 プレビュー"
          : content.language === "en"
            ? "🏉 Review"
            : "🏉 レビュー";
      const draftTweet = buildTweetText({
        awayScore: match.away_score,
        awayTeamName: awayDisplayName,
        competitionFamily: competition?.family ?? null,
        competitionLabel,
        contentType: content.content_type,
        homeScore: match.home_score,
        homeTeamName: homeDisplayName,
        language: content.language,
        matchId: content.match_id,
        recapExcerpt: createRecapExcerpt(content.content_md),
      });
      const replyText = buildLinklessReplyText(
        content.language,
        content.content_type,
      );
      const matchUrl = `https://www.trylinerugby.com/matches/${content.match_id}${
        content.language === "en" ? "/en" : ""
      }`;
      const resultImageUrl = new URL("https://www.trylinerugby.com/api/og");
      resultImageUrl.searchParams.set("type", "result");
      resultImageUrl.searchParams.set("home", homeDisplayName);
      resultImageUrl.searchParams.set("away", awayDisplayName);
      if (match.home_score !== null) {
        resultImageUrl.searchParams.set("hs", String(match.home_score));
      }
      if (match.away_score !== null) {
        resultImageUrl.searchParams.set("as", String(match.away_score));
      }
      resultImageUrl.searchParams.set("comp", competitionLabel);
      const payload: DiscordPayload = {
        embeds: [
          {
            color: content.content_type === "preview" ? 0x3b82f6 : 0x22c55e,
            description: `**${homeDisplayName} ${score} ${awayDisplayName}**`,
            fields: [
              {
                inline: false,
                name: "① X に貼る（URLなし）",
                value: `\`\`\`\n${draftTweet}\n\`\`\``,
              },
              {
                inline: false,
                name: "② リプライ案（URLなし）",
                value: `\`\`\`\n${replyText}\n\`\`\``,
              },
              {
                inline: false,
                name: "③ 記事URL（必要なら本投稿に追加）",
                value: matchUrl,
              },
            ],
            ...(content.content_type === "recap"
              ? { image: { url: resultImageUrl.toString() } }
              : {}),
            title: `${typeLabel} | ${competitionLabel}`,
          },
        ],
      };

      if (content.content_type === "recap") {
        const embed = payload.embeds[0];
        if (!embed) {
          throw new Error("Discord payload embed is missing.");
        }

        appendOfficialReplyFields(embed, {
          awayScore: match.away_score ?? 0,
          awayTeamNameEn: awayTeam?.english_name ?? awayTeam?.name ?? "Away",
          awayTeamNameJa: awayTeam?.name ?? "Away",
          competitionFamily: competition?.family ?? null,
          homeScore: match.home_score ?? 0,
          homeTeamNameEn: homeTeam?.english_name ?? homeTeam?.name ?? "Home",
          homeTeamNameJa: homeTeam?.name ?? "Home",
          tryScorers,
        });
        await appendReadingHookTweetField(embed, {
          awayScore: match.away_score ?? 0,
          awayTeamName: awayDisplayName,
          competitionLabel,
          homeScore: match.home_score ?? 0,
          homeTeamName: homeDisplayName,
          recapExcerpt: createRecapExcerpt(content.content_md).slice(0, 200),
          tryScorers,
        });
      }

      if (content.content_type === "preview" && content.language === "ja") {
        const embed = payload.embeds[0];
        if (!embed) {
          throw new Error("Discord payload embed is missing.");
        }

        const thread = await generatePreviewThread({
          awayTeamName: awayDisplayName,
          competitionFamily: competition?.family ?? null,
          competitionLabel,
          homeTeamName: homeDisplayName,
          matchId: content.match_id,
          previewMarkdown: content.content_md,
        });

        if (thread) {
          pushPreviewThreadFields(embed, thread);
        }
      }
      const webhookUrl =
        content.language === "en"
          ? requireDiscordWebhook(DISCORD_WEBHOOK_EN, "DISCORD_WEBHOOK_EN")
          : requireDiscordWebhook(DISCORD_WEBHOOK_JA, "DISCORD_WEBHOOK_JA");

      if (!content.discord_notified_at) {
        await postToDiscord(webhookUrl, payload);
      }

      const updatePayload = content.discord_notified_at
        ? {}
        : { discord_notified_at: new Date().toISOString() };

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await db
          .from("match_content")
          .update(updatePayload)
          .eq("id", content.id);

        if (updateError) {
          throw updateError;
        }
      }

      results.push({ language: content.language, matchId: content.match_id });
    }

    return NextResponse.json({
      notified: results.length,
      results,
      status: "ok",
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const err =
      error instanceof Error
        ? {
            code: (error as unknown as Record<string, unknown>).code,
            data: (error as unknown as Record<string, unknown>).data,
            message: error.message,
            rateLimit: (error as unknown as Record<string, unknown>).rateLimit,
          }
        : error;
    console.error("[notify-discord] failed", JSON.stringify(err));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
