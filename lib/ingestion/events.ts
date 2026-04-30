import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

type MatchEventMetadata = {
  player_name: string;
  is_penalty_try?: boolean;
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
  return {
    ...(event.isPenaltyTry ? { is_penalty_try: true } : {}),
    player_name: event.playerName,
  };
}

export async function upsertMatchEvents(params: {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  events: ParsedMatchEvent[];
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
        playerName: event.playerName,
        teamId,
      });

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
