import { pointsForMatchEvent } from "@/lib/format/match-event-points";
import { extractFixtureIdentifiers } from "@/lib/ingestion/external-identifiers";

import type { Json } from "@/lib/db/types";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

type FinalScoreTimeline = {
  final_away: number;
  final_home: number;
};

export type EventPointTotals = {
  away: number;
  home: number;
};

type MatchFinalScore = {
  away_score: number | null;
  home_score: number | null;
};

export type ScoreTimelineEvent = {
  is_penalty_try: boolean;
  minute: number | null;
  player_name: string;
  team_name: string;
  type: string;
};

export type EventIntegrityEvent = {
  isPenaltyTry: boolean;
  minute: number | null;
  playerName: string;
  teamId: string;
  type: string;
};

export type EventIntegrityTeams = {
  away: { id: string; name: string };
  home: { id: string; name: string };
};

export type EventInsertionMatch = {
  awayScore: number | null;
  awayTeamId: string;
  externalIds: Json;
  homeScore: number | null;
  homeTeamId: string;
  id: string;
  status: string;
};

export type ExistingEventSignatureGroup = {
  events: Array<{ metadata: Json; minute: number | null; type: string }>;
  matchId: string;
};

export type EventInsertionRejection = {
  detail: string;
  reason: "fixture_conflict" | "score_mismatch" | "third_team";
};

export type EventInsertionWarning = {
  detail: string;
  reason: "duplicate_signature";
};

export function eventTotalsMatchFinalScore(
  scoreTimeline: FinalScoreTimeline | null,
  homeScore: number | null,
  awayScore: number | null,
): boolean;
export function eventTotalsMatchFinalScore(
  totals: EventPointTotals,
  match: MatchFinalScore,
): boolean;
export function eventTotalsMatchFinalScore(
  timelineOrTotals: FinalScoreTimeline | EventPointTotals | null,
  homeScoreOrMatch: number | MatchFinalScore | null,
  awayScore?: number | null,
): boolean {
  if (timelineOrTotals === null) {
    return false;
  }

  const finalHome =
    "final_home" in timelineOrTotals
      ? timelineOrTotals.final_home
      : timelineOrTotals.home;
  const finalAway =
    "final_away" in timelineOrTotals
      ? timelineOrTotals.final_away
      : timelineOrTotals.away;

  if (typeof homeScoreOrMatch === "object" && homeScoreOrMatch !== null) {
    return (
      homeScoreOrMatch.home_score !== null &&
      homeScoreOrMatch.away_score !== null &&
      finalHome === homeScoreOrMatch.home_score &&
      finalAway === homeScoreOrMatch.away_score
    );
  }

  return (
    homeScoreOrMatch !== null &&
    awayScore !== null &&
    finalHome === homeScoreOrMatch &&
    finalAway === awayScore
  );
}

export function computeEventPointTotals(
  events: Array<
    Pick<EventIntegrityEvent, "isPenaltyTry" | "teamId" | "type">
  >,
  teams: EventIntegrityTeams,
): EventPointTotals {
  return events.reduce<EventPointTotals>(
    (totals, event) => {
      const points = pointsForMatchEvent(event);

      if (event.teamId === teams.home.id) {
        return { ...totals, home: totals.home + points };
      }

      if (event.teamId === teams.away.id) {
        return { ...totals, away: totals.away + points };
      }

      return totals;
    },
    { away: 0, home: 0 },
  );
}

export function toScoreTimelineEvent(
  event: EventIntegrityEvent,
  teams: EventIntegrityTeams,
): ScoreTimelineEvent {
  return {
    is_penalty_try: event.isPenaltyTry,
    minute: event.minute,
    player_name: event.playerName,
    team_name:
      event.teamId === teams.home.id
        ? teams.home.name
        : event.teamId === teams.away.id
          ? teams.away.name
          : "",
    type: event.type,
  };
}

function parsedEventPlayerName(event: ParsedMatchEvent): string {
  return event.type === "substitution" ? event.playerInName : event.playerName;
}

function normalizeSignatureName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function playerNameFromMetadata(metadata: Json): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  return typeof metadata.player_name === "string" ? metadata.player_name : "";
}

function signatureList(
  events: Array<{ metadata: Json; minute: number | null; type: string }>,
): string[] {
  let missingNameIndex = 0;

  return events
    .map((event) => {
      const name = normalizeSignatureName(playerNameFromMetadata(event.metadata));
      // A missing name must not make unrelated anonymous events look identical.
      const signatureName = name || `__missing_name_${missingNameIndex++}`;
      return `${event.minute ?? "null"}\u0000${event.type}\u0000${signatureName}`;
    })
    .sort((left, right) => left.localeCompare(right));
}

function parsedSignatureList(events: ParsedMatchEvent[]): string[] {
  let missingNameIndex = 0;

  return events
    .map((event) => {
      const name = normalizeSignatureName(parsedEventPlayerName(event));
      const signatureName = name || `__missing_name_${missingNameIndex++}`;
      return `${event.minute ?? "null"}\u0000${event.type}\u0000${signatureName}`;
    })
    .sort((left, right) => left.localeCompare(right));
}

function sameSignatureList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateEventInsertion(params: {
  candidateEvents: ParsedMatchEvent[];
  canonicalMatch: EventInsertionMatch;
  existingSignatureGroups: ExistingEventSignatureGroup[];
  matchesWithFixtureIdentifiers: Array<{ externalIds: Json; id: string }>;
  suppliedAwayTeamId: string;
  suppliedHomeTeamId: string;
}): {
  rejected: EventInsertionRejection[];
  warnings: EventInsertionWarning[];
} {
  const rejected: EventInsertionRejection[] = [];
  const warnings: EventInsertionWarning[] = [];
  const match = params.canonicalMatch;

  if (
    params.suppliedHomeTeamId !== match.homeTeamId ||
    params.suppliedAwayTeamId !== match.awayTeamId
  ) {
    rejected.push({
      detail: `supplied teams home=${params.suppliedHomeTeamId} away=${params.suppliedAwayTeamId}; canonical home=${match.homeTeamId} away=${match.awayTeamId}`,
      reason: "third_team",
    });
  }

  if (
    match.status === "finished" &&
    match.homeScore !== null &&
    match.awayScore !== null
  ) {
    const totals = params.candidateEvents.reduce<EventPointTotals>(
      (current, event) => {
        const points = pointsForMatchEvent(event);
        return event.teamSide === "home"
          ? { ...current, home: current.home + points }
          : { ...current, away: current.away + points };
      },
      { away: 0, home: 0 },
    );

    if (!eventTotalsMatchFinalScore(totals, {
      away_score: match.awayScore,
      home_score: match.homeScore,
    })) {
      rejected.push({
        detail: `expected=${match.homeScore}-${match.awayScore}; actual=${totals.home}-${totals.away}`,
        reason: "score_mismatch",
      });
    }
  }

  const fixtureIdentifiers = new Set(extractFixtureIdentifiers(match.externalIds));
  if (fixtureIdentifiers.size > 0) {
    const conflict = params.matchesWithFixtureIdentifiers.find(
      (other) =>
        other.id !== match.id &&
        extractFixtureIdentifiers(other.externalIds).some((identifier) =>
          fixtureIdentifiers.has(identifier),
        ),
    );
    if (conflict) {
      rejected.push({
        detail: `fixture identifier is already assigned to match_id=${conflict.id}`,
        reason: "fixture_conflict",
      });
    }
  }

  if (params.candidateEvents.length >= 4) {
    const candidateSignatures = parsedSignatureList(params.candidateEvents);
    const duplicate = params.existingSignatureGroups.find(
      (group) =>
        group.matchId !== match.id &&
        sameSignatureList(candidateSignatures, signatureList(group.events)),
    );
    if (duplicate) {
      warnings.push({
        detail: `event signatures exactly match match_id=${duplicate.matchId} (${params.candidateEvents.length} events)`,
        reason: "duplicate_signature",
      });
    }
  }

  return { rejected, warnings };
}

export function computeParsedMatchEventPointTotals(
  events: ParsedMatchEvent[],
): EventPointTotals {
  return events.reduce<EventPointTotals>(
    (totals, event) => {
      const points = pointsForMatchEvent(event);
      return event.teamSide === "home"
        ? { ...totals, home: totals.home + points }
        : { ...totals, away: totals.away + points };
    },
    { away: 0, home: 0 },
  );
}
