import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";

export type ResolvedMatchCandidate = {
  awayScore: number | null;
  awayTeamId: string;
  competitionId: string;
  externalIds: Record<string, Json>;
  homeScore: number | null;
  homeTeamId: string;
  kickoffAt: string;
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
  return {
    away_score: candidate.awayScore,
    external_ids: {
      ...asJsonObject(existing?.external_ids ?? {}),
      ...candidate.externalIds,
    },
    home_score: candidate.homeScore,
    kickoff_at: candidate.kickoffAt,
    status: candidate.status,
    venue: candidate.venue,
  };
}

async function findExistingMatch(candidate: ResolvedMatchCandidate) {
  const client = getSupabaseServerClient();
  const exactMatch = await client
    .from("matches")
    .select(
      "id, competition_id, home_team_id, away_team_id, kickoff_at, status, venue, home_score, away_score, external_ids",
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

  const scheduledMatch = await client
    .from("matches")
    .select(
      "id, competition_id, home_team_id, away_team_id, kickoff_at, status, venue, home_score, away_score, external_ids",
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

export async function upsertMatches(
  candidates: ResolvedMatchCandidate[],
  options: {
    insertMissing?: boolean;
  } = {},
): Promise<UpsertedMatch> {
  const client = getSupabaseServerClient();
  const { insertMissing = true } = options;
  const records: UpsertedMatch["records"] = [];
  let matchesInserted = 0;
  let matchesUpdated = 0;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const existing = await findExistingMatch(candidate);

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
