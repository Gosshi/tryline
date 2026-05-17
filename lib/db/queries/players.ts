import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type PlayerDetail = {
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

type PlayerDetailRow = {
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

export async function getPlayerBySlug(
  slug: string,
): Promise<PlayerDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select(
      "id, name, slug, position, team:teams!players_team_id_fkey(name, slug)",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as PlayerDetailRow;

  return {
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
    .eq("player_id", playerId)
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
    .not("slug", "is", null);

  if (error || !data) {
    return [];
  }

  return data.map((player) => player.slug);
}
