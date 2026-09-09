import { getSupabaseServerClient } from "@/lib/db/server";
import { validateEventInsertion } from "@/lib/ingestion/event-integrity";
import { notifyEventIngestionIdentityAlert } from "@/lib/llm/notify";

import type { Json } from "@/lib/db/types";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

const EVENT_INSERTION_PAGE_SIZE = 500;

type FixtureMatch = { external_ids: Json; id: string };
type ExistingEvent = {
  match_id: string;
  metadata: Json;
  minute: number | null;
  type: string;
};

type EventInsertionValidationSnapshot = {
  existingEvents: ExistingEvent[];
  fixtureMatches: FixtureMatch[];
};

let eventInsertionValidationSnapshot: Promise<EventInsertionValidationSnapshot> | null =
  null;

async function loadAllFixtureMatches() {
  const db = getSupabaseServerClient();
  const matches: FixtureMatch[] = [];

  for (let from = 0; ; from += EVENT_INSERTION_PAGE_SIZE) {
    const { data, error } = await db
      .from("matches")
      .select("id, external_ids")
      .range(from, from + EVENT_INSERTION_PAGE_SIZE - 1);

    if (error) throw error;
    matches.push(...((data ?? []) as FixtureMatch[]));
    if ((data ?? []).length < EVENT_INSERTION_PAGE_SIZE) return matches;
  }
}

async function loadAllExistingEvents() {
  const db = getSupabaseServerClient();
  const events: ExistingEvent[] = [];

  for (let from = 0; ; from += EVENT_INSERTION_PAGE_SIZE) {
    const { data, error } = await db
      .from("match_events")
      .select("match_id, minute, type, metadata")
      .range(from, from + EVENT_INSERTION_PAGE_SIZE - 1);

    if (error) throw error;
    events.push(...((data ?? []) as ExistingEvent[]));
    if ((data ?? []).length < EVENT_INSERTION_PAGE_SIZE) return events;
  }
}

function getEventInsertionValidationSnapshot() {
  if (eventInsertionValidationSnapshot !== null) {
    return eventInsertionValidationSnapshot;
  }

  const snapshot = Promise.all([
    loadAllFixtureMatches(),
    loadAllExistingEvents(),
  ]).then(([fixtureMatches, existingEvents]) => ({ fixtureMatches, existingEvents }));

  eventInsertionValidationSnapshot = snapshot;
  void snapshot.catch(() => {
    if (eventInsertionValidationSnapshot === snapshot) {
      eventInsertionValidationSnapshot = null;
    }
  });

  return snapshot;
}

export function resetEventInsertionValidationSnapshotForTest() {
  eventInsertionValidationSnapshot = null;
}

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

export class EventInsertionRejectedError extends Error {
  constructor(readonly rejected: MatchEventUpsertResult["rejected"]) {
    super(
      `Event insertion rejected: ${rejected.map((issue) => `${issue.reason}: ${issue.detail}`).join("; ")}`,
    );
    this.name = "EventInsertionRejectedError";
  }
}

export function assertEventInsertionAccepted(
  result: Pick<MatchEventUpsertResult, "rejected">,
): void {
  if (result.rejected?.length > 0) {
    throw new EventInsertionRejectedError(result.rejected);
  }
}

export async function resolvePlayerId(params: {
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

  if (data.length === 1) {
    return data[0]!.id;
  }

  const { data: japaneseNameCandidates, error: japaneseNameError } = await db
    .from("players")
    .select("id, name_ja")
    .eq("team_id", params.teamId);

  if (japaneseNameError) {
    throw japaneseNameError;
  }

  const normalizedPlayerName = params.playerName.replace(/[ \u3000]/g, "");
  const japaneseNameMatches = japaneseNameCandidates.filter(
    (player) =>
      player.name_ja !== null &&
      player.name_ja.replace(/[ \u3000]/g, "") === normalizedPlayerName,
  );

  return japaneseNameMatches.length === 1 ? japaneseNameMatches[0]!.id : null;
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

  const { existingEvents, fixtureMatches } =
    await getEventInsertionValidationSnapshot();

  const signaturesByMatch = new Map<
    string,
    Array<{ metadata: Json; minute: number | null; type: string }>
  >();
  for (const event of existingEvents) {
    if (event.match_id === params.matchId) continue;
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
    matchesWithFixtureIdentifiers: fixtureMatches.map((match) => ({
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
