import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

type MatchEventMetadata = {
  card?: string;
  is_penalty_try?: boolean;
  jersey_in?: number;
  jersey_out?: number;
  player_in_name?: string;
  player_name?: string;
  player_out_name?: string;
  source?: string;
};

async function resolvePlayerId(params: {
  playerName: string;
  teamId: string;
}): Promise<string | null> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("players")
    .select("id")
    .eq("team_id", params.teamId)
    .ilike("name", `%${params.playerName}%`);

  if (error) {
    throw error;
  }

  return data.length === 1 ? data[0]!.id : null;
}

function buildMetadata(event: ParsedMatchEvent): MatchEventMetadata {
  if (event.type === "substitution") {
    return {
      jersey_in: event.jerseyIn,
      jersey_out: event.jerseyOut,
      player_in_name: event.playerInName,
      player_out_name: event.playerOutName,
      ...(event.source ? { source: event.source } : {}),
    };
  }

  return {
    ...(event.isPenaltyTry ? { is_penalty_try: true } : {}),
    ...(event.source ? { source: event.source } : {}),
    ...(event.type === "yellow_card" || event.type === "red_card"
      ? { card: event.type }
      : {}),
    player_name: event.playerName,
  };
}

function getPlayerNameForResolution(event: ParsedMatchEvent): string {
  return event.type === "substitution" ? event.playerInName : event.playerName;
}

export async function upsertMatchEvents(params: {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  events: ParsedMatchEvent[];
  onUnresolvedPlayer?: (params: { playerName: string; teamId: string }) => void;
}): Promise<{ inserted: number }> {
  const db = getSupabaseServerClient();
  const deleteResult = await db
    .from("match_events")
    .delete()
    .eq("match_id", params.matchId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  if (params.events.length === 0) {
    return { inserted: 0 };
  }

  const rows = await Promise.all(
    params.events.map(async (event) => {
      const teamId =
        event.teamSide === "home" ? params.homeTeamId : params.awayTeamId;
      const playerId = await resolvePlayerId({
        playerName: getPlayerNameForResolution(event),
        teamId,
      });

      if (playerId === null) {
        params.onUnresolvedPlayer?.({
          playerName: getPlayerNameForResolution(event),
          teamId,
        });
      }

      return {
        match_id: params.matchId,
        metadata: buildMetadata(event) as Json,
        minute: event.minute,
        player_id: playerId,
        team_id: teamId,
        type: event.type,
      };
    }),
  );

  const { data, error } = await db
    .from("match_events")
    .insert(rows)
    .select("id");

  if (error) {
    throw error;
  }

  return { inserted: data.length };
}
