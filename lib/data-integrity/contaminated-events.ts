import { createHash } from "node:crypto";

import {
  computeEventPointTotals,
  eventTotalsMatchFinalScore,
} from "@/lib/ingestion/event-integrity";

import type { Json } from "@/lib/db/types";

type EventSignatureRow = {
  id: string;
  minute: number | null;
  player_id: string | null;
  type: string;
  team_id?: string;
  is_penalty_try?: boolean;
  metadata?: Json;
};

type ContentStatusRow = {
  content_type: string;
  status: string;
};

export type CleanupMatchRow = {
  away_team: { name: string } | null;
  home_team: { name: string } | null;
  id: string;
  kickoff_at: string;
  home_score?: number | null;
  away_score?: number | null;
  home_team_id?: string;
  away_team_id?: string;
  match_content: ContentStatusRow[];
  match_events: EventSignatureRow[];
};

export type ContaminatedEventGroup = {
  eventCount: number;
  matches: CleanupMatchRow[];
  publishedRecapCount: number;
  signature: string;
};

export function hasPublishedRecap(match: CleanupMatchRow): boolean {
  return match.match_content.some(
    (content) =>
      content.content_type === "recap" && content.status === "published",
  );
}

export function buildEventSignature(events: EventSignatureRow[]): string {
  const signatureInput = events
    .map((event) => ({
      minute: event.minute === null ? "" : String(event.minute),
      playerId: event.player_id ?? "",
      type: event.type,
    }))
    .sort((a, b) => {
      const minuteCompare = a.minute.localeCompare(b.minute);
      if (minuteCompare !== 0) return minuteCompare;

      const typeCompare = a.type.localeCompare(b.type);
      if (typeCompare !== 0) return typeCompare;

      return a.playerId.localeCompare(b.playerId);
    })
    .map((event) => `${event.type}|${event.minute}|${event.playerId}`)
    .join("\n");

  return createHash("md5").update(signatureInput).digest("hex");
}

export function findContaminatedEventGroups(
  matches: CleanupMatchRow[],
): ContaminatedEventGroup[] {
  const bySignature = new Map<string, CleanupMatchRow[]>();

  for (const match of matches) {
    if (match.match_events.length < 4) {
      continue;
    }

    const signature = buildEventSignature(match.match_events);
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), match]);
  }

  return [...bySignature.entries()]
    .map(([signature, groupMatches]) => ({
      eventCount: groupMatches[0]?.match_events.length ?? 0,
      matches: groupMatches,
      publishedRecapCount: groupMatches.filter(hasPublishedRecap).length,
      signature,
    }))
    .filter((group) => group.matches.length >= 2 && group.eventCount >= 4)
    .sort((a, b) => b.matches.length - a.matches.length);
}

export type StructuralEventMatchRow = CleanupMatchRow & {
  away_score: number | null;
  away_team_id: string;
  home_score: number | null;
  home_team_id: string;
  match_events: Array<
    EventSignatureRow & {
      is_penalty_try?: boolean;
      team_id?: string;
    }
  >;
};

export type StructuralContaminationGroup = {
  contaminated: string[];
  eventCount: number;
  owners: string[];
  signature: string;
};

export function buildStructuralEventSignature(
  events: Array<Pick<EventSignatureRow, "minute" | "type">>,
): string | null {
  if (events.some((event) => event.minute === null)) {
    return null;
  }

  const signatureInput = events
    .map((event) => ({ minute: event.minute!, type: event.type }))
    .sort((left, right) => left.minute - right.minute || left.type.localeCompare(right.type))
    .map((event) => `${event.type}|${event.minute}`)
    .join("\n");

  return createHash("md5").update(signatureInput).digest("hex");
}

function isPenaltyTry(event: EventSignatureRow): boolean {
  if (event.is_penalty_try === true) return true;
  const metadata = event.metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).is_penalty_try === true
  );
}

export function findStructuralContamination(
  matches: StructuralEventMatchRow[],
): StructuralContaminationGroup[] {
  const bySignature = new Map<
    string,
    Array<{ match: StructuralEventMatchRow; owner: boolean }>
  >();

  for (const match of matches) {
    if (
      match.match_events.length < 8 ||
      match.home_score === null ||
      match.away_score === null
    ) {
      continue;
    }

    const signature = buildStructuralEventSignature(match.match_events);
    if (!signature) {
      continue;
    }

    const totals = computeEventPointTotals(
      match.match_events.map((event) => ({
        isPenaltyTry: isPenaltyTry(event),
        teamId: event.team_id ?? "",
        type: event.type,
      })),
      {
        away: { id: match.away_team_id, name: match.away_team?.name ?? "" },
        home: { id: match.home_team_id, name: match.home_team?.name ?? "" },
      },
    );
    const owner = eventTotalsMatchFinalScore(totals, match);
    bySignature.set(signature, [
      ...(bySignature.get(signature) ?? []),
      { match, owner },
    ]);
  }

  return [...bySignature.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([signature, group]) => ({
      contaminated: group.filter(({ owner }) => !owner).map(({ match }) => match.id),
      eventCount: group[0]?.match.match_events.length ?? 0,
      owners: group.filter(({ owner }) => owner).map(({ match }) => match.id),
      signature,
    }))
    .filter((group) => group.contaminated.length > 0)
    .sort((left, right) => right.contaminated.length - left.contaminated.length);
}
