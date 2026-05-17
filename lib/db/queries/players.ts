import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type PlayerDetail = {
  aliasTeams: { name: string; slug: string }[];
  canonicalSlug: string | null;
  id: string;
  name: string;
  position: string | null;
  slug: string;
  teamName: string;
  teamSlug: string;
};

export type PlayerMatchRow = {
  awayScore: number | null;
  awayTeamName: string;
  competitionFamily: string;
  competitionName: string;
  competitionSeason: string;
  homeScore: number | null;
  homeTeamName: string;
  isStarter: boolean;
  jerseyNumber: number;
  kickoffAt: string;
  matchId: string;
  status: string;
};

export type TeamPlayerItem = {
  name: string;
  position: string | null;
  slug: string;
};

type PlayerDetailRow = {
  canonical_player_id: string | null;
  id: string;
  name: string;
  position: string | null;
  slug: string;
  team: { name: string; slug: string } | null;
};

type PlayerLineupRow = {
  is_starter: boolean;
  jersey_number: number;
  match: {
    away_score: number | null;
    away_team: { name: string } | null;
    competition: { family: string; name: string; season: string } | null;
    home_score: number | null;
    home_team: { name: string } | null;
    id: string;
    kickoff_at: string;
    status: string;
  } | null;
};

type PlayerAliasTeamRow = {
  team: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

export async function getPlayerBySlug(
  slug: string,
): Promise<PlayerDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select(
      "id, name, slug, position, canonical_player_id, team:teams!players_team_id_fkey ( name, slug )",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as PlayerDetailRow;
  const primaryTeamSlug = row.team?.slug ?? "";
  let canonicalSlug: string | null = null;
  const aliasTeams: { name: string; slug: string }[] = [];

  if (row.canonical_player_id) {
    const { data: canonicalData } = await client
      .from("players")
      .select("slug")
      .eq("id", row.canonical_player_id)
      .single();

    canonicalSlug = (canonicalData as { slug: string } | null)?.slug ?? null;
  } else {
    const { data: aliasData } = await client
      .from("players")
      .select("team:teams!players_team_id_fkey ( name, slug )")
      .eq("canonical_player_id", row.id);

    const seen = new Set<string>();

    for (const alias of (aliasData ?? []) as unknown as PlayerAliasTeamRow[]) {
      const team = firstRelation(alias.team);

      if (!team || team.slug === primaryTeamSlug || seen.has(team.slug)) {
        continue;
      }

      seen.add(team.slug);
      aliasTeams.push({ name: team.name, slug: team.slug });
    }
  }

  return {
    aliasTeams,
    canonicalSlug,
    id: row.id,
    name: row.name,
    position: row.position ?? null,
    slug: row.slug,
    teamName: row.team?.name ?? "",
    teamSlug: row.team?.slug ?? "",
  };
}

export async function getMatchesForPlayer(
  playerId: string,
): Promise<PlayerMatchRow[]> {
  const client = getSupabasePublicServerClient();
  const { data: aliases } = await client
    .from("players")
    .select("id")
    .or(`id.eq.${playerId},canonical_player_id.eq.${playerId}`);
  const playerIds = (aliases ?? []).map((alias) => alias.id);

  const { data, error } = await client
    .from("match_lineups")
    .select(
      `
        jersey_number,
        is_starter,
        match:matches!match_lineups_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey ( name ),
          away_team:teams!matches_away_team_id_fkey ( name ),
          competition:competitions!matches_competition_id_fkey (
            name,
            season,
            family
          )
        )
      `,
    )
    .in("player_id", playerIds.length > 0 ? playerIds : [playerId])
    .order("kickoff_at", {
      ascending: false,
      foreignTable: "matches",
    })
    .limit(30);

  if (error || !data) {
    return [];
  }

  return (data as PlayerLineupRow[]).flatMap((row) => {
    const match = row.match;

    if (!match) {
      return [];
    }

    return {
      awayScore: match.away_score,
      awayTeamName: match.away_team?.name ?? "",
      competitionFamily: match.competition?.family ?? "",
      competitionName: match.competition?.name ?? "",
      competitionSeason: match.competition?.season ?? "",
      homeScore: match.home_score,
      homeTeamName: match.home_team?.name ?? "",
      isStarter: row.is_starter,
      jerseyNumber: row.jersey_number,
      kickoffAt: match.kickoff_at,
      matchId: match.id,
      status: match.status,
    };
  });
}

export async function listAllPlayerSlugs(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select("slug")
    .is("canonical_player_id", null)
    .not("slug", "is", null);

  if (error || !data) {
    return [];
  }

  return data.map((player) => player.slug);
}

export async function getPlayersByTeamSlug(
  teamSlug: string,
): Promise<TeamPlayerItem[]> {
  const client = getSupabasePublicServerClient();
  const { data: teamData } = await client
    .from("teams")
    .select("id")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (!teamData) {
    return [];
  }

  const { data, error } = await client
    .from("players")
    .select("name, position, slug")
    .eq("team_id", teamData.id)
    .is("canonical_player_id", null)
    .order("name");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    name: row.name,
    position: row.position ?? null,
    slug: row.slug,
  }));
}
