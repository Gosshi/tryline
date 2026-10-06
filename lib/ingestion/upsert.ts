import { isDeepStrictEqual } from "node:util";

import { getSupabaseServerClient } from "@/lib/db/server";
import { FixtureIngestSafetyError } from "@/lib/ingestion/fixture-ingest-error";

import type { Json } from "@/lib/db/types";

export type ResolvedMatchCandidate = {
  awayScore: number | null;
  awayTeamId: string;
  competitionId: string;
  externalIds: Record<string, Json>;
  homeScore: number | null;
  homeTeamId: string;
  kickoffAt: string | null;
  kickoffTimeTbd?: boolean;
  status: "finished" | "scheduled";
  venue: string | null;
};

export type MatchUpsertCounts = {
  matchesInserted: number;
  matchesUpdated: number;
};

export type UpsertedMatch = MatchUpsertCounts & {
  records: Array<{
    awayTeamId: string;
    candidateIndex: number;
    externalIds: Record<string, Json>;
    homeTeamId: string;
    id: string;
    previousStatus: string | null;
    status: "finished" | "scheduled";
    statusChangedToFinished: boolean;
  }>;
};

type ExistingMatch = {
  away_score: number | null;
  away_team_id: string;
  competition_id: string;
  external_ids: Json;
  home_score: number | null;
  home_team_id: string;
  id: string;
  kickoff_at: string;
  kickoff_time_tbd: boolean;
  status: string;
  venue: string | null;
};

function asJsonObject(value: Json): Record<string, Json> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, Json>;
}

function buildMatchUpdate(
  existing: ExistingMatch | null,
  candidate: ResolvedMatchCandidate,
) {
  const keepExistingFinishedScore =
    existing?.status === "finished" &&
    existing.home_score !== null &&
    existing.away_score !== null &&
    (candidate.homeScore === null || candidate.awayScore === null);

  return {
    away_score: keepExistingFinishedScore
      ? existing.away_score
      : candidate.awayScore,
    external_ids: {
      ...asJsonObject(existing?.external_ids ?? {}),
      ...candidate.externalIds,
    },
    home_score: keepExistingFinishedScore
      ? existing.home_score
      : candidate.homeScore,
    kickoff_at: candidate.kickoffAt ?? existing?.kickoff_at,
    kickoff_time_tbd:
      candidate.kickoffTimeTbd ??
      (candidate.kickoffAt ? false : (existing?.kickoff_time_tbd ?? false)),
    status: keepExistingFinishedScore ? "finished" : candidate.status,
    venue: candidate.venue,
  };
}

async function findExistingMatch(candidate: ResolvedMatchCandidate) {
  const client = getSupabaseServerClient();
  const stableExternalId = ["wikipedia_event_id", "top14_lnr_id"]
    .map((key) => ({ key, value: candidate.externalIds[key] }))
    .find(
      (entry): entry is { key: string; value: string } =>
        typeof entry.value === "string" && entry.value.length > 0,
    );

  if (stableExternalId) {
    // Older no-id rugbyboxes used timestamps. Accept their IDs while moving
    // to a date-only ID, so announcing a kickoff updates the original row.
    const legacyIds = candidate.externalIds.wikipedia_legacy_event_ids;
    const ids = [
      stableExternalId.value,
      ...(stableExternalId.key === "wikipedia_event_id" &&
      Array.isArray(legacyIds)
        ? legacyIds.filter((id): id is string => typeof id === "string")
        : []),
    ];
    for (const id of new Set(ids)) {
      const matchByStableExternalId = await client
        .from("matches")
        .select(
          "id, competition_id, home_team_id, away_team_id, kickoff_at, kickoff_time_tbd, status, venue, home_score, away_score, external_ids",
        )
        .eq("competition_id", candidate.competitionId)
        .contains("external_ids", {
          [stableExternalId.key]: id,
        })
        .maybeSingle();

      if (matchByStableExternalId.error) {
        throw matchByStableExternalId.error;
      }

      if (matchByStableExternalId.data) {
        return matchByStableExternalId.data;
      }
    }
  }

  if (!candidate.kickoffAt) {
    return null;
  }

  const exactMatch = await client
    .from("matches")
    .select(
      "id, competition_id, home_team_id, away_team_id, kickoff_at, kickoff_time_tbd, status, venue, home_score, away_score, external_ids",
    )
    .eq("competition_id", candidate.competitionId)
    .eq("home_team_id", candidate.homeTeamId)
    .eq("away_team_id", candidate.awayTeamId)
    .eq("kickoff_at", candidate.kickoffAt)
    .maybeSingle();

  if (exactMatch.error) {
    throw exactMatch.error;
  }

  if (exactMatch.data) {
    return exactMatch.data;
  }

  // Stable source IDs identify repeated fixtures with the same teams. Do not
  // collapse a new event onto another scheduled match just because the teams
  // are identical.
  if (stableExternalId) {
    return null;
  }

  const scheduledMatch = await client
    .from("matches")
    .select(
      "id, competition_id, home_team_id, away_team_id, kickoff_at, kickoff_time_tbd, status, venue, home_score, away_score, external_ids",
    )
    .eq("competition_id", candidate.competitionId)
    .eq("home_team_id", candidate.homeTeamId)
    .eq("away_team_id", candidate.awayTeamId)
    .eq("status", "scheduled")
    .maybeSingle();

  if (scheduledMatch.error) {
    throw scheduledMatch.error;
  }

  return scheduledMatch.data;
}

export type MatchUpsertPlan = Array<{
  candidate: ResolvedMatchCandidate;
  existing: ExistingMatch | null;
  operation: "insert" | "update" | "unchanged";
  changes: Record<string, { before: Json; after: Json }>;
}>;

async function findExistingTeamPair(candidate: ResolvedMatchCandidate) {
  const { data, error } = await getSupabaseServerClient()
    .from("matches")
    .select(
      "id, competition_id, home_team_id, away_team_id, kickoff_at, kickoff_time_tbd, status, venue, home_score, away_score, external_ids",
    )
    .eq("competition_id", candidate.competitionId)
    .eq("home_team_id", candidate.homeTeamId)
    .eq("away_team_id", candidate.awayTeamId)
    .limit(2);

  if (error) throw error;
  if (data && data.length > 1) {
    throw new FixtureIngestSafetyError(
      `Duplicate existing RWC 2027 team pair: ${candidate.homeTeamId} vs ${candidate.awayTeamId}`,
    );
  }
  return data?.[0] ?? null;
}

// Preflight performs reads only. RWC ignores page-local symbols for matching
// and drops the incoming symbol so buildMatchUpdate retains the stored ID.
export async function planMatchUpserts(
  candidates: ResolvedMatchCandidate[],
  options: { matchByTeamPair?: boolean } = {},
): Promise<MatchUpsertPlan> {
  const plan: MatchUpsertPlan = [];
  for (const original of candidates) {
    const existing = options.matchByTeamPair
      ? await findExistingTeamPair(original)
      : await findExistingMatch(original);
    const candidate = { ...original, externalIds: { ...original.externalIds } };
    if (options.matchByTeamPair)
      delete candidate.externalIds.wikipedia_event_id;
    const changes: MatchUpsertPlan[number]["changes"] = {};
    if (existing) {
      const update = buildMatchUpdate(existing, candidate);
      for (const [key, after] of Object.entries(update)) {
        const before = existing[key as keyof ExistingMatch];
        if (!isDeepStrictEqual(before, after)) {
          changes[key] = { before: before ?? null, after: after ?? null };
        }
      }
    }
    plan.push({
      candidate,
      existing,
      changes,
      operation: !existing
        ? "insert"
        : Object.keys(changes).length
          ? "update"
          : "unchanged",
    });
  }
  return plan;
}

async function writeMatches(
  candidates: ResolvedMatchCandidate[],
  findExisting: (
    candidate: ResolvedMatchCandidate,
    index: number,
  ) => Promise<ExistingMatch | null>,
  options: { insertMissing?: boolean } = {},
): Promise<UpsertedMatch> {
  const client = getSupabaseServerClient();
  const { insertMissing = true } = options;
  const records: UpsertedMatch["records"] = [];
  let matchesInserted = 0;
  let matchesUpdated = 0;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const existing = await findExisting(candidate, candidateIndex);

    if (existing) {
      const previousStatus = existing.status;
      const update = buildMatchUpdate(existing, candidate);
      const { data, error } = await client
        .from("matches")
        .update(update)
        .eq("id", existing.id)
        .select("id, external_ids")
        .single();

      if (error) {
        throw error;
      }

      matchesUpdated += 1;
      records.push({
        awayTeamId: candidate.awayTeamId,
        candidateIndex,
        externalIds: asJsonObject(data.external_ids),
        homeTeamId: candidate.homeTeamId,
        id: data.id,
        previousStatus,
        status: candidate.status,
        statusChangedToFinished:
          previousStatus !== "finished" && candidate.status === "finished",
      });
      continue;
    }

    if (!candidate.kickoffAt) {
      console.warn("[ingestion] skipped match without kickoff_at", {
        externalIds: candidate.externalIds,
        teams: `${candidate.homeTeamId} vs ${candidate.awayTeamId}`,
      });
      continue;
    }

    if (!insertMissing) {
      continue;
    }

    const { data, error } = await client
      .from("matches")
      .insert({
        away_score: candidate.awayScore,
        away_team_id: candidate.awayTeamId,
        competition_id: candidate.competitionId,
        external_ids: candidate.externalIds,
        home_score: candidate.homeScore,
        home_team_id: candidate.homeTeamId,
        kickoff_at: candidate.kickoffAt,
        kickoff_time_tbd: candidate.kickoffTimeTbd ?? false,
        status: candidate.status,
        venue: candidate.venue,
      })
      .select("id, external_ids")
      .single();

    if (error) {
      throw error;
    }

    matchesInserted += 1;
    records.push({
      awayTeamId: candidate.awayTeamId,
      candidateIndex,
      externalIds: asJsonObject(data.external_ids),
      homeTeamId: candidate.homeTeamId,
      id: data.id,
      previousStatus: null,
      status: candidate.status,
      statusChangedToFinished: false,
    });
  }

  return {
    matchesInserted,
    matchesUpdated,
    records,
  };
}

export async function upsertMatches(
  candidates: ResolvedMatchCandidate[],
  options: { insertMissing?: boolean } = {},
): Promise<UpsertedMatch> {
  return writeMatches(candidates, findExistingMatch, options);
}

// Apply the exact preflight decisions rather than looking up page IDs again.
export async function upsertPlannedMatches(
  plan: MatchUpsertPlan,
): Promise<UpsertedMatch> {
  return writeMatches(
    plan.map((entry) => entry.candidate),
    async (_candidate, index) => plan[index]!.existing,
  );
}
