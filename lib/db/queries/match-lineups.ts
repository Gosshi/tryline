import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchLineupPlayer = {
  jerseyNumber: number;
  isStarter: boolean;
  playerName: string;
  playerSlug: string | null;
  position: string | null;
  teamId: string;
};

export async function getMatchLineupsForMatch(
  matchId: string,
): Promise<MatchLineupPlayer[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_lineups")
    .select(
      `
        jersey_number,
        is_starter,
        team_id,
        player:players!match_lineups_player_id_fkey (
          name,
          position,
          slug
        )
      `,
    )
    .eq("match_id", matchId)
    .order("team_id")
    .order("jersey_number");

  if (error) {
    throw error;
  }

  return data.map((row) => {
    const player = row.player as unknown as {
      name: string;
      position?: string | null;
      slug?: string | null;
    } | null;

    return {
      isStarter: row.is_starter,
      jerseyNumber: row.jersey_number,
      playerName: player?.name ?? "—",
      playerSlug: player?.slug ?? null,
      position: player?.position ?? null,
      teamId: row.team_id,
    };
  });
}
