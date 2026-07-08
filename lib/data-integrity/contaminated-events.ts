import { createHash } from "node:crypto";

type EventSignatureRow = {
  id: string;
  minute: number | null;
  player_id: string | null;
  type: string;
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
