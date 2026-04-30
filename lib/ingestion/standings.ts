import { getSupabaseServerClient } from "@/lib/db/server";

import type { ParsedStandingsRow } from "@/lib/scrapers/wikipedia-standings";

export async function upsertCompetitionStandings(params: {
  competitionId: string;
  rows: ParsedStandingsRow[];
  teamLookup: Record<string, string>;
}): Promise<{ upserted: number }> {
  const records = params.rows.flatMap((row) => {
    const teamId = params.teamLookup[row.teamName];

    if (!teamId) {
      console.warn(
        `Skipping standings row because team is missing from seed data: ${row.teamName}`,
      );
      return [];
    }

    return [
      {
        bonus_points_losing: row.bonusPointsLosing,
        bonus_points_try: row.bonusPointsTry,
        competition_id: params.competitionId,
        drawn: row.drawn,
        lost: row.lost,
        played: row.played,
        points_against: row.pointsAgainst,
        points_for: row.pointsFor,
        position: row.position,
        team_id: teamId,
        total_points: row.totalPoints,
        tries_for: row.triesFor,
        updated_at: new Date().toISOString(),
        won: row.won,
      },
    ];
  });

  if (records.length === 0) {
    return { upserted: 0 };
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("competition_standings")
    .upsert(records, {
      onConflict: "competition_id,team_id",
    })
    .select("id");

  if (error) {
    throw error;
  }

  return { upserted: data?.length ?? 0 };
}
