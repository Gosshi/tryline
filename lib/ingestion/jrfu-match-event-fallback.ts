import { getSupabaseServerClient } from "@/lib/db/server";
import { pointsForMatchEvent } from "@/lib/format/match-event-points";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { JRFU_OPPONENT_SLUGS } from "@/lib/ingestion/jrfu-result-fallback";
import { fetchJrfuMatchEvents } from "@/lib/scrapers/jrfu-match-events";

import type { JrfuScheduleResult } from "@/lib/scrapers/jrfu-schedule-results";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

export const JRFU_MATCH_EVENT_FALLBACK_LIMIT = 5;

export type JrfuMatchEventFallbackResult = {
  counts: {
    existing_events_skipped: number;
    match_limit_skipped: number;
    matches_inserted: number;
    score_mismatches_skipped: number;
    unresolved_player_names: number;
    unsupported_timeline_skipped: number;
  };
  source: "jrfu-match-events";
};

type JapanMatchRow = {
  away_score: number | null;
  away_team: { id: string; slug: string } | null;
  home_score: number | null;
  home_team: { id: string; slug: string } | null;
  id: string;
  kickoff_at: string;
};

type Candidate = {
  match: JapanMatchRow;
  result: JrfuScheduleResult;
};

function utcDate(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function dateDistanceInDays(left: string, right: string): number {
  const [leftYear, leftMonth, leftDay] = left.split("-").map(Number);
  const [rightYear, rightMonth, rightDay] = right.split("-").map(Number);

  return (
    Math.abs(
      Date.UTC(leftYear ?? 0, (leftMonth ?? 1) - 1, leftDay ?? 0) -
        Date.UTC(rightYear ?? 0, (rightMonth ?? 1) - 1, rightDay ?? 0),
    ) /
    (24 * 60 * 60 * 1000)
  );
}

function isJapanOpponentMatch(row: JapanMatchRow, opponentSlug: string) {
  return (
    (row.home_team?.slug === "japan" && row.away_team?.slug === opponentSlug) ||
    (row.away_team?.slug === "japan" && row.home_team?.slug === opponentSlug)
  );
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
      "id, kickoff_at, home_score, away_score, home_team:teams!matches_home_team_id_fkey(id, slug), away_team:teams!matches_away_team_id_fkey(id, slug)",
    )
    .or(`home_team_id.eq.${japan.id},away_team_id.eq.${japan.id}`);

  if (error) {
    throw error;
  }

  return (data ?? []) as JapanMatchRow[];
}

async function hasExistingEvents(matchId: string): Promise<boolean> {
  const client = getSupabaseServerClient();
  const { count, error } = await client
    .from("match_events")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

function candidatesForResults(
  matches: JapanMatchRow[],
  jrfuResults: JrfuScheduleResult[],
): Candidate[] {
  const candidates = new Map<string, Candidate>();

  for (const result of jrfuResults) {
    if (
      result.matchUrl === null ||
      result.japanScore === null ||
      result.opponentScore === null
    ) {
      continue;
    }

    const opponentSlug = JRFU_OPPONENT_SLUGS[result.opponentName];

    if (!opponentSlug) {
      continue;
    }

    const matchingRows = matches.filter(
      (match) =>
        match.home_score !== null &&
        match.away_score !== null &&
        dateDistanceInDays(utcDate(match.kickoff_at), result.dateJrfu) <= 2 &&
        isJapanOpponentMatch(match, opponentSlug),
    );

    if (matchingRows.length === 1 && matchingRows[0]) {
      candidates.set(matchingRows[0].id, { match: matchingRows[0], result });
    }
  }

  return [...candidates.values()].sort((left, right) =>
    left.match.kickoff_at.localeCompare(right.match.kickoff_at),
  );
}

function eventTotals(events: ParsedMatchEvent[]) {
  return events.reduce(
    (totals, event) => {
      totals[event.teamSide] += pointsForMatchEvent(event);
      return totals;
    },
    { away: 0, home: 0 },
  );
}

function eventScoresMatch(events: ParsedMatchEvent[], match: JapanMatchRow) {
  const totals = eventTotals(events);

  return {
    matches:
      totals.home === match.home_score && totals.away === match.away_score,
    totals,
  };
}

export async function applyJrfuMatchEventFallback(
  jrfuResults: JrfuScheduleResult[],
): Promise<JrfuMatchEventFallbackResult> {
  const counts = {
    existing_events_skipped: 0,
    match_limit_skipped: 0,
    matches_inserted: 0,
    score_mismatches_skipped: 0,
    unresolved_player_names: 0,
    unsupported_timeline_skipped: 0,
  };
  const unresolvedPlayerNames = new Set<string>();
  const candidates = candidatesForResults(
    await loadJapanMatches(),
    jrfuResults,
  );
  const eventlessCandidates: Candidate[] = [];

  for (const candidate of candidates) {
    if (await hasExistingEvents(candidate.match.id)) {
      counts.existing_events_skipped += 1;
      continue;
    }

    eventlessCandidates.push(candidate);
  }

  const cappedCandidates = eventlessCandidates.slice(
    0,
    JRFU_MATCH_EVENT_FALLBACK_LIMIT,
  );
  counts.match_limit_skipped =
    eventlessCandidates.length - cappedCandidates.length;

  for (const candidate of cappedCandidates) {
    const parsed = await fetchJrfuMatchEvents(candidate.result.matchUrl!);

    if (parsed.hasUnsupportedScoringEvent) {
      counts.unsupported_timeline_skipped += 1;
      console.warn(
        "[jrfu-match-event-fallback] unsupported scoring indicator; skipped",
        { matchId: candidate.match.id },
      );
      continue;
    }

    const scoreCheck = eventScoresMatch(parsed.events, candidate.match);

    if (!scoreCheck.matches) {
      counts.score_mismatches_skipped += 1;
      console.warn(
        "[jrfu-match-event-fallback] event total mismatch; skipped",
        {
          actualScore: scoreCheck.totals,
          expectedScore: {
            away: candidate.match.away_score,
            home: candidate.match.home_score,
          },
          matchId: candidate.match.id,
        },
      );
      continue;
    }

    const inserted = await upsertMatchEvents({
      awayTeamId: candidate.match.away_team!.id,
      events: parsed.events,
      homeTeamId: candidate.match.home_team!.id,
      matchId: candidate.match.id,
      onUnresolvedPlayer: ({ playerName }) => {
        if (!unresolvedPlayerNames.has(playerName)) {
          unresolvedPlayerNames.add(playerName);
          console.warn("[jrfu-match-event-fallback] unresolved player", {
            matchId: candidate.match.id,
            playerName,
          });
        }
      },
    });

    if (inserted.inserted > 0) {
      counts.matches_inserted += 1;
    }
  }

  counts.unresolved_player_names = unresolvedPlayerNames.size;

  return { counts, source: "jrfu-match-events" };
}
