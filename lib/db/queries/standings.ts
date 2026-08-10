import { unstable_cache } from "next/cache";
import { cache } from "react";

import { PUBLIC_DATA_CACHE_TAGS } from "@/lib/cache/public-data";
import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { getTeamDisplayName } from "@/lib/format/team";

export type StandingRow = {
  position: number;
  teamName: string;
  teamShortCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  bonusPointsTry: number;
  bonusPointsLosing: number;
  totalPoints: number;
};

export type PoolStanding = {
  poolName: string;
  standings: StandingRow[];
};

export type StandingPositionLookup = Map<string, Map<string, number>>;

export type StandingsPageParam = {
  competition: string;
  season: string;
  updatedAt: string;
};

type CompetitionStandingRow = {
  bonus_points_losing: number;
  bonus_points_try: number;
  drawn: number;
  lost: number;
  played: number;
  points_against: number;
  points_for: number;
  position: number;
  team: { name: string; short_code: string | null; slug: string } | null;
  total_points: number;
  tries_for: number;
  won: number;
};

async function loadStandingsForCompetition(
  competitionSlug: string,
): Promise<StandingRow[]> {
  const client = getSupabasePublicServerClient();

  const { data: competition, error: compError } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (compError) {
    throw compError;
  }

  if (!competition) {
    return [];
  }

  const { data, error } = await client
    .from("competition_standings")
    .select(
      `
        position,
        played,
        won,
        drawn,
        lost,
        points_for,
        points_against,
        tries_for,
        bonus_points_try,
        bonus_points_losing,
        total_points,
        team:teams!competition_standings_team_id_fkey (
          name,
          slug,
          short_code
        )
      `,
    )
    .eq("competition_id", competition.id)
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as CompetitionStandingRow[]).map((row) => ({
    bonusPointsLosing: row.bonus_points_losing,
    bonusPointsTry: row.bonus_points_try,
    drawn: row.drawn,
    lost: row.lost,
    played: row.played,
    pointsAgainst: row.points_against,
    pointsFor: row.points_for,
    position: row.position,
    teamName: row.team
      ? getTeamDisplayName({
          name: row.team.name,
          slug: row.team.slug,
        })
      : "-",
    teamShortCode: row.team?.short_code ?? "-",
    totalPoints: row.total_points,
    triesFor: row.tries_for,
    won: row.won,
  }));
}

export const getStandingsForCompetition = cache(
  unstable_cache(loadStandingsForCompetition, ["public-data", "standings"], {
    revalidate: 900,
    tags: [PUBLIC_DATA_CACHE_TAGS.standings],
  }),
);

type StandingsPageParamRow = {
  competition:
    | { family: string; season: string }
    | Array<{ family: string; season: string }>
    | null;
  updated_at: string;
};

async function loadStandingsPageParams(): Promise<StandingsPageParam[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competition_standings")
    .select(
      "updated_at, competition:competitions!competition_standings_competition_id_fkey(family, season)",
    );

  if (error) {
    throw error;
  }

  const latestByCompetition = new Map<string, StandingsPageParam>();

  for (const row of (data ?? []) as StandingsPageParamRow[]) {
    const competition = Array.isArray(row.competition)
      ? (row.competition[0] ?? null)
      : row.competition;

    if (!competition) {
      continue;
    }

    const key = `${competition.family}-${competition.season}`;
    const existing = latestByCompetition.get(key);

    if (!existing || row.updated_at > existing.updatedAt) {
      latestByCompetition.set(key, {
        competition: competition.family,
        season: competition.season,
        updatedAt: row.updated_at,
      });
    }
  }

  return [...latestByCompetition.values()];
}

export const listStandingsPageParams = cache(
  unstable_cache(
    loadStandingsPageParams,
    ["public-data", "standings-page-params"],
    {
      revalidate: 900,
      tags: [PUBLIC_DATA_CACHE_TAGS.standings],
    },
  ),
);

async function loadStandingsUpdatedAtForCompetition(
  competitionSlug: string,
): Promise<string | null> {
  const client = getSupabasePublicServerClient();
  const { data: competition, error: competitionError } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (competitionError) {
    throw competitionError;
  }

  if (!competition) {
    return null;
  }

  const { data, error } = await client
    .from("competition_standings")
    .select("updated_at")
    .eq("competition_id", competition.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

export const getStandingsUpdatedAtForCompetition = cache(
  unstable_cache(
    loadStandingsUpdatedAtForCompetition,
    ["public-data", "standings-updated-at"],
    {
      revalidate: 900,
      tags: [PUBLIC_DATA_CACHE_TAGS.standings],
    },
  ),
);

type CompetitionPoolRow = {
  pool_name: string;
  team_id: string;
};

export async function getPoolStandingsForCompetition(
  competitionSlug: string,
): Promise<PoolStanding[]> {
  const client = getSupabasePublicServerClient();
  const { data: competition, error: compError } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (compError) {
    throw compError;
  }

  if (!competition) {
    return [];
  }

  const [standingsData, poolsData] = await Promise.all([
    client
      .from("competition_standings")
      .select(
        `
          position,
          played,
          won,
          drawn,
          lost,
          points_for,
          points_against,
          tries_for,
          bonus_points_try,
          bonus_points_losing,
          total_points,
          team_id,
          team:teams!competition_standings_team_id_fkey (
            name,
            slug,
            short_code
          )
        `,
      )
      .eq("competition_id", competition.id)
      .order("position", { ascending: true }),
    client
      .from("competition_pools")
      .select("pool_name, team_id")
      .eq("competition_id", competition.id),
  ]);

  if (standingsData.error) {
    throw standingsData.error;
  }

  if (poolsData.error) {
    throw poolsData.error;
  }

  const poolNameByTeamId = new Map<string, string>();

  for (const row of (poolsData.data ?? []) as CompetitionPoolRow[]) {
    if (row.pool_name) {
      poolNameByTeamId.set(row.team_id, row.pool_name);
    }
  }

  if (poolNameByTeamId.size === 0) {
    return [];
  }

  const grouped = new Map<string, StandingRow[]>();

  for (const row of (standingsData.data ?? []) as Array<
    CompetitionStandingRow & { team_id: string }
  >) {
    const poolName = poolNameByTeamId.get(row.team_id);

    if (!poolName) {
      continue;
    }

    const standing: StandingRow = {
      bonusPointsLosing: row.bonus_points_losing,
      bonusPointsTry: row.bonus_points_try,
      drawn: row.drawn,
      lost: row.lost,
      played: row.played,
      pointsAgainst: row.points_against,
      pointsFor: row.points_for,
      position: row.position,
      teamName: row.team
        ? getTeamDisplayName({
            name: row.team.name,
            slug: row.team.slug,
          })
        : "-",
      teamShortCode: row.team?.short_code ?? "-",
      totalPoints: row.total_points,
      triesFor: row.tries_for,
      won: row.won,
    };
    const current = grouped.get(poolName) ?? [];
    current.push(standing);
    grouped.set(poolName, current);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([poolName, standings]) => ({
      poolName,
      standings: [...standings].sort(
        (left, right) => left.position - right.position,
      ),
    }));
}

type StandingPositionRow = {
  competition_id: string;
  position: number;
  team_id: string;
};

export async function getStandingPositionLookupForCompetitions(
  competitionIds: string[],
): Promise<StandingPositionLookup> {
  const uniqueCompetitionIds = [...new Set(competitionIds)].filter(Boolean);

  if (uniqueCompetitionIds.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competition_standings")
    .select("competition_id, team_id, position")
    .in("competition_id", uniqueCompetitionIds);

  if (error) {
    throw error;
  }

  const positionsByCompetition: StandingPositionLookup = new Map();

  for (const row of (data ?? []) as StandingPositionRow[]) {
    const positions =
      positionsByCompetition.get(row.competition_id) ??
      new Map<string, number>();
    positions.set(row.team_id, row.position);
    positionsByCompetition.set(row.competition_id, positions);
  }

  return positionsByCompetition;
}
