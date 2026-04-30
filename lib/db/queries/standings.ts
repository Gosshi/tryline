import { getSupabasePublicServerClient } from "@/lib/db/public-server";

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

type CompetitionStandingRow = {
  bonus_points_losing: number;
  bonus_points_try: number;
  drawn: number;
  lost: number;
  played: number;
  points_against: number;
  points_for: number;
  position: number;
  team: { name: string; short_code: string | null } | null;
  total_points: number;
  tries_for: number;
  won: number;
};

export async function getStandingsForCompetition(
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
    teamName: row.team?.name ?? "-",
    teamShortCode: row.team?.short_code ?? "-",
    totalPoints: row.total_points,
    triesFor: row.tries_for,
    won: row.won,
  }));
}
