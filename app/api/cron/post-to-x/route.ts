import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";
import { postMatchRecapToX } from "@/lib/x/post";

export const maxDuration = 60;

type Relation<T> = T | T[] | null;

type TeamRow = {
  name: string | null;
};

type CompetitionRow = {
  name: string | null;
  season: string | null;
};

type MatchRow = {
  away_score: number | null;
  away_team: Relation<TeamRow>;
  competition: Relation<CompetitionRow>;
  home_score: number | null;
  home_team: Relation<TeamRow>;
};

type ContentRow = {
  content_md_ja: string;
  content_type: "preview" | "recap";
  id: string;
  match_id: string;
  matches: Relation<MatchRow>;
};

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

export async function POST(request: Request) {
  try {
    assertCronAuthorized(request);

    const db = getSupabaseServerClient();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data, error } = await db
      .from("match_content")
      .select(
        `
        id,
        match_id,
        content_type,
        content_md_ja,
        matches (
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey ( name ),
          away_team:teams!matches_away_team_id_fkey ( name ),
          competition:competitions!matches_competition_id_fkey ( name, season )
        )
      `,
      )
      .eq("status", "published")
      .eq("language", "ja")
      .in("content_type", ["recap", "preview"])
      .is("x_posted_at", null)
      .gte("generated_at", sevenDaysAgo)
      .order("generated_at", { ascending: true })
      .limit(5);

    if (error) {
      throw error;
    }

    const results: Array<{ matchId: string; tweetId: string }> = [];

    for (const content of (data ?? []) as unknown as ContentRow[]) {
      const match = firstRelation(content.matches);
      if (!match) {
        continue;
      }

      const homeTeam = firstRelation(match.home_team);
      const awayTeam = firstRelation(match.away_team);
      const competition = firstRelation(match.competition);
      const competitionLabel = [competition?.name, competition?.season]
        .filter(Boolean)
        .join(" ");

      const tweetId = await postMatchRecapToX({
        awayScore: match.away_score,
        awayTeamName: awayTeam?.name ?? "Away",
        competitionLabel,
        contentType: content.content_type,
        homeScore: match.home_score,
        homeTeamName: homeTeam?.name ?? "Home",
        matchId: content.match_id,
        recapExcerpt: createRecapExcerpt(content.content_md_ja),
      });

      const { error: updateError } = await db
        .from("match_content")
        .update({ x_posted_at: new Date().toISOString() })
        .eq("id", content.id);

      if (updateError) {
        throw updateError;
      }

      results.push({ matchId: content.match_id, tweetId });
    }

    return NextResponse.json({ posted: results.length, results, status: "ok" });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const err =
      error instanceof Error
        ? {
            message: error.message,
            code: (error as unknown as Record<string, unknown>).code,
            data: (error as unknown as Record<string, unknown>).data,
            rateLimit: (error as unknown as Record<string, unknown>).rateLimit,
          }
        : error;
    console.error("[post-to-x] failed", JSON.stringify(err));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
