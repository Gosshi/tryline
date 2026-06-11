/**
 * Detect duplicated match event sets and optionally remove contaminated rows.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-contaminated-events.ts [--confirm-owner-approved]
 */

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { getSupabaseServerClient } from "@/lib/db/server";

type CliOptions = {
  ownerApproved: boolean;
};

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

export function parseOptions(argv: string[]): CliOptions {
  let ownerApproved = false;

  for (const arg of argv) {
    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
      continue;
    }

    if (arg === "--dry-run") {
      continue;
    }

    throw new Error(
      "Usage: pnpm tsx scripts/cleanup-contaminated-events.ts [--confirm-owner-approved]",
    );
  }

  return { ownerApproved };
}

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

async function loadFinishedMatchesWithEvents(): Promise<CleanupMatchRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        match_events(id, type, minute, player_id),
        match_content(content_type, status)
      `,
    )
    .eq("status", "finished");

  if (error) {
    throw error;
  }

  return ((data ?? []) as CleanupMatchRow[]).filter(
    (match) => match.match_events.length > 0,
  );
}

function printGroups(groups: ContaminatedEventGroup[]) {
  if (groups.length === 0) {
    console.log("No contaminated event groups detected.");
    return;
  }

  for (const [index, group] of groups.entries()) {
    console.log(
      `Group ${index + 1}: matches=${group.matches.length} events=${group.eventCount} published_recaps=${group.publishedRecapCount} signature=${group.signature}`,
    );

    for (const match of group.matches) {
      console.log(
        `  - ${match.kickoff_at.slice(0, 10)} ${match.home_team?.name ?? "Unknown"} vs ${match.away_team?.name ?? "Unknown"} (${match.id}) published_recap=${hasPublishedRecap(match)}`,
      );
    }
  }
}

export async function applyCleanup(
  groups: ContaminatedEventGroup[],
  client = getSupabaseServerClient(),
) {
  const matchIds = [
    ...new Set(groups.flatMap((group) => group.matches.map((match) => match.id))),
  ];

  if (matchIds.length === 0) {
    return {
      demotedRecaps: 0,
      deletedEvents: 0,
      matchCount: 0,
    };
  }

  const deleteResult = await client
    .from("match_events")
    .delete()
    .in("match_id", matchIds)
    .select("id");

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const demoteResult = await client
    .from("match_content")
    .update({ status: "draft" })
    .in("match_id", matchIds)
    .eq("content_type", "recap")
    .eq("status", "published")
    .select("id");

  if (demoteResult.error) {
    throw demoteResult.error;
  }

  return {
    demotedRecaps: demoteResult.data?.length ?? 0,
    deletedEvents: deleteResult.data?.length ?? 0,
    matchCount: matchIds.length,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const matches = await loadFinishedMatchesWithEvents();
  const groups = findContaminatedEventGroups(matches);

  printGroups(groups);

  if (!options.ownerApproved) {
    console.log("[dry-run] No DELETE or UPDATE was executed.");
    return;
  }

  const summary = await applyCleanup(groups);
  console.log(
    `Deleted ${summary.deletedEvents} events across ${summary.matchCount} matches, demoted ${summary.demotedRecaps} recaps to draft`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
