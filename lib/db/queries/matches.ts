import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { type MatchStatus } from "@/lib/format/status";

import type { Json } from "@/lib/db/types";

export type MatchListItem = {
  id: string;
  kickoffAt: string;
  status: MatchStatus;
  homeTeam: { slug: string; name: string; shortCode: string };
  awayTeam: { slug: string; name: string; shortCode: string };
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: number | null;
};

export type MatchDetail = MatchListItem & {
  competition: { slug: string; name: string; season: string };
};

type BaseMatchRow = {
  id: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  external_ids: Json;
  home_team: {
    slug: string;
    name: string;
    short_code: string | null;
  } | null;
  away_team: {
    slug: string;
    name: string;
    short_code: string | null;
  } | null;
};

type MatchDetailRow = BaseMatchRow & {
  competition: {
    slug: string;
    name: string;
    season: string;
  } | null;
};

function isMatchStatus(value: string): value is MatchStatus {
  return [
    "scheduled",
    "in_progress",
    "finished",
    "postponed",
    "cancelled",
  ].includes(value);
}

function getRoundFromExternalIds(externalIds: Json): number | null {
  if (!externalIds || typeof externalIds !== "object" || Array.isArray(externalIds)) {
    return null;
  }

  const round = externalIds.wikipedia_round;

  return typeof round === "number" ? round : null;
}

function mapMatchRow(row: BaseMatchRow): MatchListItem {
  if (!row.home_team || !row.away_team) {
    throw new Error(`Match ${row.id} is missing team relations.`);
  }

  if (!isMatchStatus(row.status)) {
    throw new Error(`Match ${row.id} has an unsupported status: ${row.status}`);
  }

  return {
    awayScore: row.away_score,
    awayTeam: {
      name: row.away_team.name,
      shortCode: row.away_team.short_code ?? row.away_team.name.slice(0, 3).toUpperCase(),
      slug: row.away_team.slug,
    },
    homeScore: row.home_score,
    homeTeam: {
      name: row.home_team.name,
      shortCode: row.home_team.short_code ?? row.home_team.name.slice(0, 3).toUpperCase(),
      slug: row.home_team.slug,
    },
    id: row.id,
    kickoffAt: row.kickoff_at,
    round: getRoundFromExternalIds(row.external_ids),
    status: row.status,
    venue: row.venue,
  };
}

async function getCompetitionBySlug(competitionSlug: string) {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function listMatchesForCompetition(
  competitionSlug: string,
): Promise<MatchListItem[]> {
  const competition = await getCompetitionBySlug(competitionSlug);

  if (!competition) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        )
      `,
    )
    .eq("competition_id", competition.id)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data satisfies BaseMatchRow[]).map(mapMatchRow);
}

export async function getMatchById(matchId: string): Promise<MatchDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        ),
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season
        )
      `,
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const match = mapMatchRow(data satisfies MatchDetailRow);

  if (!data.competition) {
    throw new Error(`Match ${matchId} is missing competition relation.`);
  }

  return {
    ...match,
    competition: data.competition,
  };
}
