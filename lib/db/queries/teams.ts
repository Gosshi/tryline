import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { type MatchStatus } from "@/lib/format/status";

export type TeamSummary = {
  country: string | null;
  name: string;
  slug: string;
};

export type TeamDetail = {
  country: string;
  name: string;
  shortCode: string | null;
  slug: string;
};

export type TeamMatchItem = {
  awayScore: number | null;
  awayTeam: { slug: string; name: string; shortCode: string | null };
  competition: { slug: string; name: string; season: string };
  homeScore: number | null;
  homeTeam: { slug: string; name: string; shortCode: string | null };
  id: string;
  kickoffAt: string;
  round: number | null;
  status: MatchStatus;
  venue: string | null;
};

type TeamRow = {
  country: string | null;
  id: string;
  name: string;
  short_code: string | null;
  slug: string;
};

type TeamMatchRow = {
  away_score: number | null;
  away_team: { slug: string; name: string; short_code: string | null } | null;
  competition:
    | { slug: string; name: string; season: string }
    | null;
  external_ids: unknown;
  home_score: number | null;
  home_team: { slug: string; name: string; short_code: string | null } | null;
  id: string;
  kickoff_at: string;
  status: string;
  venue: string | null;
};

function getRoundFromExternalIds(externalIds: unknown): number | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const round = (externalIds as Record<string, unknown>).round ??
    (externalIds as Record<string, unknown>).wikipedia_round;

  return typeof round === "number" ? round : null;
}

function isMatchStatus(value: string): value is MatchStatus {
  return [
    "scheduled",
    "in_progress",
    "finished",
    "postponed",
    "cancelled",
  ].includes(value);
}

function mapTeamMatchRow(row: TeamMatchRow): TeamMatchItem {
  if (!row.home_team || !row.away_team || !row.competition) {
    throw new Error(`Team page match ${row.id} is missing relations.`);
  }

  if (!isMatchStatus(row.status)) {
    throw new Error(`Match ${row.id} has an unsupported status: ${row.status}`);
  }

  return {
    awayScore: row.away_score,
    awayTeam: {
      name: row.away_team.name,
      shortCode: row.away_team.short_code,
      slug: row.away_team.slug,
    },
    competition: row.competition,
    homeScore: row.home_score,
    homeTeam: {
      name: row.home_team.name,
      shortCode: row.home_team.short_code,
      slug: row.home_team.slug,
    },
    id: row.id,
    kickoffAt: row.kickoff_at,
    round: getRoundFromExternalIds(row.external_ids),
    status: row.status,
    venue: row.venue,
  };
}

async function loadTeamRowBySlug(slug: string): Promise<TeamRow | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("id, slug, name, short_code, country")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as TeamRow | null) ?? null;
}

async function loadMatchesByTeamId(params: {
  ascending: boolean;
  limit: number;
  status: "finished" | "scheduled";
  teamId: string;
}): Promise<TeamMatchItem[]> {
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
    .eq("status", params.status)
    .or(`home_team_id.eq.${params.teamId},away_team_id.eq.${params.teamId}`)
    .order("kickoff_at", { ascending: params.ascending })
    .limit(params.limit);

  if (error) {
    throw error;
  }

  return (data as TeamMatchRow[]).map(mapTeamMatchRow);
}

export async function listAllTeams(): Promise<TeamSummary[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("slug, name, country")
    .order("name");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getTeamBySlug(slug: string): Promise<TeamDetail | null> {
  const row = await loadTeamRowBySlug(slug);

  if (!row) {
    return null;
  }

  return {
    country: row.country ?? "",
    name: row.name,
    shortCode: row.short_code,
    slug: row.slug,
  };
}

export async function getTeamRecentMatches(
  teamId: string,
  limit = 10,
): Promise<TeamMatchItem[]> {
  return loadMatchesByTeamId({
    ascending: false,
    limit,
    status: "finished",
    teamId,
  });
}

export async function getTeamUpcomingMatches(
  teamId: string,
  limit = 5,
): Promise<TeamMatchItem[]> {
  return loadMatchesByTeamId({
    ascending: true,
    limit,
    status: "scheduled",
    teamId,
  });
}

export async function getTeamPageDataBySlug(slug: string): Promise<{
  recentMatches: TeamMatchItem[];
  team: TeamDetail;
  upcomingMatches: TeamMatchItem[];
} | null> {
  const row = await loadTeamRowBySlug(slug);

  if (!row) {
    return null;
  }

  const [recentMatches, upcomingMatches] = await Promise.all([
    getTeamRecentMatches(row.id),
    getTeamUpcomingMatches(row.id),
  ]);

  return {
    recentMatches,
    team: {
      country: row.country ?? "",
      name: row.name,
      shortCode: row.short_code,
      slug: row.slug,
    },
    upcomingMatches,
  };
}
