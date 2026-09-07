import { getSupabaseServerClient } from "@/lib/db/server";
import { validateEventInsertion } from "@/lib/ingestion/event-integrity";
import { notifyEventIngestionIdentityAlert } from "@/lib/llm/notify";

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

export type MatchEventUpsertResult = Awaited<ReturnType<typeof upsertMatchEvents>>;

export function assertEventInsertionAccepted(
  result: Pick<MatchEventUpsertResult, "rejected">,
): void {
  if (result.rejected?.length > 0) {
    throw new Error(
      `Event insertion rejected: ${result.rejected.map((issue) => `${issue.reason}: ${issue.detail}`).join("; ")}`,
    );
  }
}

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
}): Promise<{
  inserted: number;
  rejected: Array<{
    detail: string;
    reason: "fixture_conflict" | "score_mismatch" | "third_team";
  }>;
  warnings: Array<{ detail: string; reason: "duplicate_signature" }>;
}> {
  const db = getSupabaseServerClient();
  const { data: canonicalMatch, error: canonicalMatchError } = await db
    .from("matches")
    .select("id, status, home_team_id, away_team_id, home_score, away_score, external_ids")
    .eq("id", params.matchId)
    .single();

  if (canonicalMatchError) {
    throw canonicalMatchError;
  }

  const [{ data: fixtureMatches, error: fixtureMatchesError }, { data: existingEvents, error: existingEventsError }] = await Promise.all([
    db.from("matches").select("id, external_ids"),
    db
      .from("match_events")
      .select("match_id, minute, type, metadata")
      .neq("match_id", params.matchId),
  ]);

  if (fixtureMatchesError) {
    throw fixtureMatchesError;
  }
  if (existingEventsError) {
    throw existingEventsError;
  }

  const signaturesByMatch = new Map<
    string,
    Array<{ metadata: Json; minute: number | null; type: string }>
  >();
  for (const event of existingEvents ?? []) {
    const events = signaturesByMatch.get(event.match_id) ?? [];
    events.push({ metadata: event.metadata, minute: event.minute, type: event.type });
    signaturesByMatch.set(event.match_id, events);
  }
  const validation = validateEventInsertion({
    candidateEvents: params.events,
    canonicalMatch: {
      awayScore: canonicalMatch.away_score,
      awayTeamId: canonicalMatch.away_team_id,
      externalIds: canonicalMatch.external_ids,
      homeScore: canonicalMatch.home_score,
      homeTeamId: canonicalMatch.home_team_id,
      id: canonicalMatch.id,
      status: canonicalMatch.status,
    },
    existingSignatureGroups: [...signaturesByMatch].map(([matchId, events]) => ({ matchId, events })),
    matchesWithFixtureIdentifiers: (fixtureMatches ?? []).map((match) => ({
      externalIds: match.external_ids,
      id: match.id,
    })),
    suppliedAwayTeamId: params.awayTeamId,
    suppliedHomeTeamId: params.homeTeamId,
  });

  for (const issue of [...validation.rejected, ...validation.warnings]) {
    console.warn("[event-ingestion] identity guard", { matchId: params.matchId, ...issue });
    await notifyEventIngestionIdentityAlert({ matchId: params.matchId, ...issue });
  }

  if (validation.rejected.length > 0) {
    return { inserted: 0, ...validation };
  }

  const deleteResult = await db
    .from("match_events")
    .delete()
    .eq("match_id", params.matchId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  if (params.events.length === 0) {
    return { inserted: 0, ...validation };
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

  return { inserted: data.length, ...validation };
}
