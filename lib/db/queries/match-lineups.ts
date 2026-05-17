import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchLineupPlayer = {
  jerseyNumber: number;
  isStarter: boolean;
  playerName: string;
  playerSlug: string | null;
  position: string | null;
  teamId: string;
};

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

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
          slug,
          canonical:players!players_canonical_player_id_fkey ( slug )
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
      canonical?: { slug: string } | { slug: string }[] | null;
      name: string;
      position?: string | null;
      slug?: string | null;
    } | null;
    const canonical = firstRelation(player?.canonical);

    return {
      isStarter: row.is_starter,
      jerseyNumber: row.jersey_number,
      playerName: player?.name ?? "—",
      playerSlug: canonical?.slug ?? player?.slug ?? null,
      position: player?.position ?? null,
      teamId: row.team_id,
    };
  });
}
