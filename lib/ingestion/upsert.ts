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
  matchesSkippedUnsafe: number;
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

export type ExistingMatch = {
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

function isUnsafeFinishedKickoff(
  existing: ExistingMatch | null,
  candidate: ResolvedMatchCandidate,
): boolean {
  return (
    existing?.status === "finished" &&
    candidate.kickoffAt !== null &&
    Math.abs(
      Date.parse(candidate.kickoffAt) - Date.parse(existing.kickoff_at),
    ) >
      48 * 60 * 60 * 1000
  );
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

function getStableExternalIds(candidate: ResolvedMatchCandidate) {
  const stableExternalId = ["wikipedia_event_id", "top14_lnr_id"]
    .map((key) => ({ key, value: candidate.externalIds[key] }))
    .find(
      (entry): entry is { key: string; value: string } =>
        typeof entry.value === "string" && entry.value.length > 0,
    );

  if (!stableExternalId) return null;
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
  return { key: stableExternalId.key, ids: [...new Set(ids)] };
}

async function findExistingMatch(candidate: ResolvedMatchCandidate) {
  const client = getSupabaseServerClient();
  const stableExternalId = getStableExternalIds(candidate);
  if (stableExternalId) {
    for (const id of stableExternalId.ids) {
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
  operation: "insert" | "update" | "unchanged" | "blocked";
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

// A repaired snapshot lets the repair dry-run use the same preflight without
// changing the database. Match by stable source ID first, then exact kickoff.
function findExistingSnapshotMatch(
  candidate: ResolvedMatchCandidate,
  rows: ExistingMatch[],
): ExistingMatch | null {
  const competitionRows = rows.filter(
    (row) => row.competition_id === candidate.competitionId,
  );
  const one = (matches: ExistingMatch[]) => {
    if (matches.length > 1)
      throw new FixtureIngestSafetyError("Ambiguous match in repair snapshot");
    return matches[0] ?? null;
  };
  const stable = getStableExternalIds(candidate);
  if (stable) {
    for (const id of stable.ids) {
      const match = one(
        competitionRows.filter(
          (row) => asJsonObject(row.external_ids)[stable.key] === id,
        ),
      );
      if (match) return match;
    }
  }
  if (!candidate.kickoffAt) return null;
  const kickoff = Date.parse(candidate.kickoffAt);
  const pair = competitionRows.filter(
    (row) =>
      row.home_team_id === candidate.homeTeamId &&
      row.away_team_id === candidate.awayTeamId,
  );
  const exact = one(
    pair.filter((row) => Date.parse(row.kickoff_at) === kickoff),
  );
  return (
    exact ??
    (stable ? null : one(pair.filter((row) => row.status === "scheduled")))
  );
}

// Preflight performs reads only. RWC ignores page-local symbols for matching
// and drops the incoming symbol so buildMatchUpdate retains the stored ID.
export async function planMatchUpserts(
  candidates: ResolvedMatchCandidate[],
  options: {
    matchByTeamPair?: boolean;
    existingMatches?: ExistingMatch[];
  } = {},
): Promise<MatchUpsertPlan> {
  if (options.matchByTeamPair && options.existingMatches) {
    throw new FixtureIngestSafetyError(
      "Repair snapshots do not support team-pair-only matching",
    );
  }
  const plan: MatchUpsertPlan = [];
  for (const original of candidates) {
    const existing = options.existingMatches
      ? findExistingSnapshotMatch(original, options.existingMatches)
      : options.matchByTeamPair
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
      operation: isUnsafeFinishedKickoff(existing, candidate)
        ? "blocked"
        : !existing
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
  let matchesSkippedUnsafe = 0;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const existing = await findExisting(candidate, candidateIndex);

    if (existing && isUnsafeFinishedKickoff(existing, candidate)) {
      matchesSkippedUnsafe += 1;
      console.error("[ingestion] blocked unsafe finished kickoff change", {
        id: existing.id,
        homeTeamId: candidate.homeTeamId,
        awayTeamId: candidate.awayTeamId,
        previousKickoffAt: existing.kickoff_at,
        kickoffAt: candidate.kickoffAt,
      });
      continue;
    }

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
    matchesSkippedUnsafe,
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
