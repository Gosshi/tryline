import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchJrfuScheduleResults } from "@/lib/scrapers/jrfu-schedule-results";

import type { JrfuScheduleResult } from "@/lib/scrapers/jrfu-schedule-results";

export const JRFU_OPPONENT_SLUGS: Record<string, string> = {
  アイルランド代表: "ireland",
  アメリカ代表: "united-states",
  イタリア代表: "italy",
  イングランド代表: "england",
  ウェールズ代表: "wales",
  オーストラリア代表: "australia",
  カナダ代表: "canada",
  スコットランド代表: "scotland",
  フィジー代表: "fiji",
  フランス代表: "france",
};

export type JrfuResultFallbackResult = {
  counts: {
    existing_results_skipped: number;
    matches_updated: number;
    unknown_opponents_skipped: number;
  };
  source: "jrfu-schedule";
};

type JapanMatchRow = {
  away_score: number | null;
  away_team: { slug: string } | null;
  home_score: number | null;
  home_team: { slug: string } | null;
  id: string;
  kickoff_at: string;
  status: string;
};

function utcDate(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function dateDistanceInDays(left: string, right: string): number {
  const [leftYear, leftMonth, leftDay] = left.split("-").map(Number);
  const [rightYear, rightMonth, rightDay] = right.split("-").map(Number);

  return Math.abs(
    Date.UTC(leftYear ?? 0, (leftMonth ?? 1) - 1, leftDay ?? 0) -
      Date.UTC(rightYear ?? 0, (rightMonth ?? 1) - 1, rightDay ?? 0),
  ) / (24 * 60 * 60 * 1000);
}

function isJapanOpponentMatch(row: JapanMatchRow, opponentSlug: string) {
  return (
    (row.home_team?.slug === "japan" && row.away_team?.slug === opponentSlug) ||
    (row.away_team?.slug === "japan" && row.home_team?.slug === opponentSlug)
  );
}

function hasCompleteJrfuScore(result: JrfuScheduleResult) {
  return result.japanScore !== null && result.opponentScore !== null;
}

function scoreForMatch(row: JapanMatchRow, result: JrfuScheduleResult) {
  return row.home_team?.slug === "japan"
    ? { away_score: result.opponentScore, home_score: result.japanScore }
    : { away_score: result.japanScore, home_score: result.opponentScore };
}

async function loadJapanMatches(): Promise<JapanMatchRow[]> {
  const client = getSupabaseServerClient();
  const { data: japan, error: japanError } = await client
    .from("teams")
    .select("id")
    .eq("slug", "japan")
    .single();

  if (japanError) {
    throw japanError;
  }

  const { data, error } = await client
    .from("matches")
    .select(
      "id, kickoff_at, status, home_score, away_score, home_team:teams!matches_home_team_id_fkey(slug), away_team:teams!matches_away_team_id_fkey(slug)",
    )
    .or(`home_team_id.eq.${japan.id},away_team_id.eq.${japan.id}`);

  if (error) {
    throw error;
  }

  return (data ?? []) as JapanMatchRow[];
}

export async function applyJrfuResultFallback(): Promise<JrfuResultFallbackResult> {
  const [jrfuResults, japanMatches] = await Promise.all([
    fetchJrfuScheduleResults(),
    loadJapanMatches(),
  ]);
  const client = getSupabaseServerClient();
  const counts = {
    existing_results_skipped: 0,
    matches_updated: 0,
    unknown_opponents_skipped: 0,
  };

  for (const result of jrfuResults) {
    if (!hasCompleteJrfuScore(result)) {
      continue;
    }

    const opponentSlug = JRFU_OPPONENT_SLUGS[result.opponentName];

    if (!opponentSlug) {
      counts.unknown_opponents_skipped += 1;
      console.warn("[jrfu-result-fallback] skipped unknown opponent", {
        opponentName: result.opponentName,
      });
      continue;
    }

    const candidates = japanMatches.filter(
      (match) =>
        dateDistanceInDays(utcDate(match.kickoff_at), result.dateJrfu) <= 2 &&
        isJapanOpponentMatch(match, opponentSlug),
    );

    if (candidates.length !== 1) {
      console.warn("[jrfu-result-fallback] skipped unmatched result", {
        candidateMatchIds: candidates.map((match) => match.id),
        dateJrfu: result.dateJrfu,
        opponentName: result.opponentName,
      });
      continue;
    }

    const match = candidates[0];

    if (!match) {
      continue;
    }

    const scores = scoreForMatch(match, result);

    if (
      match.status === "finished" ||
      match.home_score !== null ||
      match.away_score !== null
    ) {
      counts.existing_results_skipped += 1;

      if (
        match.home_score !== null &&
        match.away_score !== null &&
        (match.home_score !== scores.home_score ||
          match.away_score !== scores.away_score)
      ) {
        console.warn("[jrfu-result-fallback] existing score conflict; skipped", {
          jrfuScore: scores,
          matchId: match.id,
          storedScore: {
            away_score: match.away_score,
            home_score: match.home_score,
          },
        });
      }
      continue;
    }

    const { error } = await client
      .from("matches")
      .update({ ...scores, status: "finished" })
      .eq("id", match.id);

    if (error) {
      throw error;
    }

    counts.matches_updated += 1;
  }

  return { counts, source: "jrfu-schedule" };
}
