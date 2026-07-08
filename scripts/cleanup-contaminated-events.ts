/**
 * Detect duplicated match event sets and optionally remove contaminated rows.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-contaminated-events.ts [--confirm-owner-approved]
 */

import { pathToFileURL } from "node:url";

import {
  findContaminatedEventGroups,
  hasPublishedRecap,
  type CleanupMatchRow,
  type ContaminatedEventGroup,
} from "@/lib/data-integrity/contaminated-events";
import { getSupabaseServerClient } from "@/lib/db/server";

export {
  buildEventSignature,
  findContaminatedEventGroups,
  hasPublishedRecap,
  type CleanupMatchRow,
  type ContaminatedEventGroup,
} from "@/lib/data-integrity/contaminated-events";

type CliOptions = {
  ownerApproved: boolean;
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
