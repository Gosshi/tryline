import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchEventRow = {
  id: string;
  minute: number | null;
  type: string;
  teamId: string;
  playerName: string;
  isPenaltyTry: boolean;
};

export async function getMatchEventsForMatch(
  matchId: string,
): Promise<MatchEventRow[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_events")
    .select("id, minute, type, team_id, metadata")
    .eq("match_id", matchId)
    .order("minute", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return data.map((row) => {
    const metadata = row.metadata as {
      player_name?: string;
      is_penalty_try?: boolean;
    } | null;

    return {
      id: row.id,
      isPenaltyTry: metadata?.is_penalty_try ?? false,
      minute: row.minute,
      playerName: metadata?.player_name ?? "—",
      teamId: row.team_id,
      type: row.type,
    };
  });
}
