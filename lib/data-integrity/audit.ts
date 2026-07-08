import {
  findContaminatedEventGroups,
  type CleanupMatchRow,
  type ContaminatedEventGroup,
} from "@/lib/data-integrity/contaminated-events";
import { getSupabaseServerClient } from "@/lib/db/server";
import { computeScoreTimeline, eventTotalsMatchFinalScore } from "@/lib/llm/stages/assemble";

import type { Json } from "@/lib/db/types";
import type { AssembledContentInput } from "@/lib/llm/types";

const STALE_STANDINGS_THRESHOLD_DAYS = 7;
const RECENT_DRAFT_WINDOW_DAYS = 7;

type AuditClient = ReturnType<typeof getSupabaseServerClient>;

export type AuditMatchEventRow = {
  id: string;
  metadata: Json;
  minute: number | null;
  player_id: string | null;
  team_id: string;
  type: string;
};

export type AuditFinishedMatchRow = CleanupMatchRow & {
  away_score: number | null;
  away_team_id: string;
  home_score: number | null;
  home_team_id: string;
  match_events: AuditMatchEventRow[];
};

export type DraftContentRow = {
  generated_at: string;
  id: string;
};

export type StandingFreshnessRow = {
  competition_id: string;
  competition: {
    end_date: string | null;
    name: string;
    season: string;
    slug: string;
    start_date: string | null;
  } | null;
  updated_at: string;
};

export type DuplicateEventsSummary = {
  groupCount: number;
  groups: Array<{
    eventCount: number;
    matchCount: number;
    matchIds: string[];
    publishedRecapCount: number;
    signature: string;
  }>;
  matchCount: number;
};

export type ScoreMismatchSummary = {
  count: number;
  matches: Array<{
    actualAway: number;
    actualHome: number;
    expectedAway: number | null;
    expectedHome: number | null;
    matchId: string;
  }>;
};

export type EmptyFinishedEventsSummary = {
  count: number;
  matchIds: string[];
};

export type DraftBacklogSummary = {
  recent7Days: number;
  total: number;
};

export type StaleStandingsSummary = {
  competitions: Array<{
    competitionId: string;
    daysStale: number;
    latestUpdatedAt: string;
    name: string;
    season: string;
    slug: string;
  }>;
  count: number;
};

export type DataIntegrityAuditReport = {
  draftBacklog: DraftBacklogSummary;
  duplicateEvents: DuplicateEventsSummary;
  emptyFinishedEvents: EmptyFinishedEventsSummary;
  generatedAt: string;
  scoreMismatches: ScoreMismatchSummary;
  staleStandings: StaleStandingsSummary;
};

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function getBooleanMetadataFlag(metadata: Json, key: string): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  return (metadata as Record<string, Json>)[key] === true;
}

function toScoreEvent(
  match: AuditFinishedMatchRow,
  event: AuditMatchEventRow,
): AssembledContentInput["match_events"][number] {
  return {
    is_penalty_try: getBooleanMetadataFlag(event.metadata, "is_penalty_try"),
    minute: event.minute,
    player_name: "",
    team_name:
      event.team_id === match.home_team_id
        ? (match.home_team?.name ?? "")
        : event.team_id === match.away_team_id
          ? (match.away_team?.name ?? "")
          : "",
    type: event.type,
  };
}

function summarizeContaminatedGroups(
  groups: ContaminatedEventGroup[],
): DuplicateEventsSummary {
  const matchIds = new Set(
    groups.flatMap((group) => group.matches.map((match) => match.id)),
  );

  return {
    groupCount: groups.length,
    groups: groups.map((group) => ({
      eventCount: group.eventCount,
      matchCount: group.matches.length,
      matchIds: group.matches.map((match) => match.id),
      publishedRecapCount: group.publishedRecapCount,
      signature: group.signature,
    })),
    matchCount: matchIds.size,
  };
}

export function summarizeDuplicateEvents(
  matches: CleanupMatchRow[],
): DuplicateEventsSummary {
  return summarizeContaminatedGroups(findContaminatedEventGroups(matches));
}

export function summarizeScoreMismatches(
  matches: AuditFinishedMatchRow[],
): ScoreMismatchSummary {
  const mismatches: ScoreMismatchSummary["matches"] = [];

  for (const match of matches) {
    const homeName = match.home_team?.name ?? "";
    const awayName = match.away_team?.name ?? "";
    const events = [...match.match_events]
      .sort((left, right) => (left.minute ?? 0) - (right.minute ?? 0))
      .map((event) => toScoreEvent(match, event));
    const timeline = computeScoreTimeline(events, homeName, awayName);

    if (
      !eventTotalsMatchFinalScore(
        timeline,
        match.home_score,
        match.away_score,
      )
    ) {
      mismatches.push({
        actualAway: timeline?.final_away ?? 0,
        actualHome: timeline?.final_home ?? 0,
        expectedAway: match.away_score,
        expectedHome: match.home_score,
        matchId: match.id,
      });
    }
  }

  return {
    count: mismatches.length,
    matches: mismatches,
  };
}

export function summarizeEmptyFinishedEvents(
  matches: AuditFinishedMatchRow[],
): EmptyFinishedEventsSummary {
  const matchIds = matches
    .filter((match) => match.match_events.length === 0)
    .map((match) => match.id);

  return {
    count: matchIds.length,
    matchIds,
  };
}

export function summarizeDraftBacklog(
  rows: DraftContentRow[],
  now: Date,
): DraftBacklogSummary {
  const cutoff = new Date(now.getTime() - RECENT_DRAFT_WINDOW_DAYS * 86_400_000);

  return {
    recent7Days: rows.filter((row) => new Date(row.generated_at) >= cutoff)
      .length,
    total: rows.length,
  };
}

function isCompetitionActive(
  competition: NonNullable<StandingFreshnessRow["competition"]>,
  now: Date,
): boolean {
  const today = now.toISOString().slice(0, 10);
  const startsBeforeOrToday =
    competition.start_date === null || competition.start_date <= today;
  const endsAfterOrToday =
    competition.end_date === null || competition.end_date >= today;

  return startsBeforeOrToday && endsAfterOrToday;
}

export function summarizeStaleStandings(
  rows: StandingFreshnessRow[],
  now: Date,
): StaleStandingsSummary {
  const latestByCompetition = new Map<
    string,
    {
      competition: NonNullable<StandingFreshnessRow["competition"]>;
      updatedAt: Date;
    }
  >();

  for (const row of rows) {
    if (!row.competition || !isCompetitionActive(row.competition, now)) {
      continue;
    }

    const updatedAt = new Date(row.updated_at);
    const current = latestByCompetition.get(row.competition_id);

    if (!current || updatedAt > current.updatedAt) {
      latestByCompetition.set(row.competition_id, {
        competition: row.competition,
        updatedAt,
      });
    }
  }

  const competitions = [...latestByCompetition.entries()]
    .map(([competitionId, entry]) => ({
      competitionId,
      daysStale: daysBetween(now, entry.updatedAt),
      latestUpdatedAt: entry.updatedAt.toISOString(),
      name: entry.competition.name,
      season: entry.competition.season,
      slug: entry.competition.slug,
    }))
    .filter(
      (competition) =>
        competition.daysStale >= STALE_STANDINGS_THRESHOLD_DAYS,
    )
    .sort((left, right) => right.daysStale - left.daysStale);

  return {
    competitions,
    count: competitions.length,
  };
}

async function loadFinishedMatches(client: AuditClient) {
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        home_score,
        away_score,
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        match_events(id, type, minute, player_id, team_id, metadata),
        match_content(content_type, status)
      `,
    )
    .eq("status", "finished");

  if (error) {
    throw error;
  }

  return (data ?? []) as AuditFinishedMatchRow[];
}

async function loadDraftContent(client: AuditClient) {
  const { data, error } = await client
    .from("match_content")
    .select("id, generated_at")
    .eq("status", "draft");

  if (error) {
    throw error;
  }

  return (data ?? []) as DraftContentRow[];
}

async function loadStandingFreshnessRows(client: AuditClient) {
  const { data, error } = await client.from("competition_standings").select(
    `
      competition_id,
      updated_at,
      competition:competitions!competition_standings_competition_id_fkey(
        name,
        season,
        slug,
        start_date,
        end_date
      )
    `,
  );

  if (error) {
    throw error;
  }

  return (data ?? []) as StandingFreshnessRow[];
}

export async function runDataIntegrityAudit(
  client: AuditClient = getSupabaseServerClient(),
  now = new Date(),
): Promise<DataIntegrityAuditReport> {
  const [finishedMatches, draftRows, standingsRows] = await Promise.all([
    loadFinishedMatches(client),
    loadDraftContent(client),
    loadStandingFreshnessRows(client),
  ]);

  return {
    draftBacklog: summarizeDraftBacklog(draftRows, now),
    duplicateEvents: summarizeDuplicateEvents(finishedMatches),
    emptyFinishedEvents: summarizeEmptyFinishedEvents(finishedMatches),
    generatedAt: now.toISOString(),
    scoreMismatches: summarizeScoreMismatches(finishedMatches),
    staleStandings: summarizeStaleStandings(standingsRows, now),
  };
}
