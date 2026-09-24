/**
 * Detect duplicated match event sets and optionally remove contaminated rows.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-contaminated-events.ts [--confirm-owner-approved]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  findContaminatedEventGroups,
  findStructuralContamination,
  hasPublishedRecap,
  type CleanupMatchRow,
  type ContaminatedEventGroup,
  type StructuralContaminationGroup,
  type StructuralEventMatchRow,
} from "@/lib/data-integrity/contaminated-events";
import { getSupabaseServerClient } from "@/lib/db/server";
import {
  computeEventPointTotals,
  eventTotalsMatchFinalScore,
} from "@/lib/ingestion/event-integrity";

export {
  buildEventSignature,
  buildStructuralEventSignature,
  findContaminatedEventGroups,
  findStructuralContamination,
  hasPublishedRecap,
  type CleanupMatchRow,
  type ContaminatedEventGroup,
  type StructuralContaminationGroup,
  type StructuralEventMatchRow,
} from "@/lib/data-integrity/contaminated-events";

type CliOptions = {
  ownerApproved: boolean;
};

export type CleanupPlanGroup = ContaminatedEventGroup & {
  ownerIds: string[];
  ownerMatches?: CleanupMatchRow[];
  source: "legacy" | "structural";
};

export function parseOptions(argv: string[]): CliOptions {
  let ownerApproved = false;

  for (const arg of argv) {
    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
      continue;
    }
    if (arg === "--dry-run") continue;

    throw new Error(
      "Usage: pnpm tsx scripts/cleanup-contaminated-events.ts [--confirm-owner-approved]",
    );
  }

  return { ownerApproved };
}

async function loadFinishedMatchesWithEvents(): Promise<StructuralEventMatchRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        home_score,
        away_score,
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        match_events(id, type, minute, player_id, team_id, metadata),
        match_content(content_type, status)
      `,
    )
    .eq("status", "finished");

  if (error) throw error;

  return ((data ?? []) as StructuralEventMatchRow[]).filter(
    (match) => match.match_events.length > 0,
  );
}

export function findCleanupGroups(
  matches: StructuralEventMatchRow[],
): CleanupPlanGroup[] {
  const rowsById = new Map(matches.map((match) => [match.id, match]));
  const structural = findStructuralContamination(matches);
  const ownerIds = new Set(structural.flatMap((group) => group.owners));
  const unknownScoreIds = new Set(
    matches
      .filter(
        (match) =>
          match.home_score === null ||
          match.home_score === undefined ||
          match.away_score === null ||
          match.away_score === undefined,
      )
      .map((match) => match.id),
  );
  for (const match of matches) {
    if (
      match.home_score !== null &&
      match.home_score !== undefined &&
      match.away_score !== null &&
      match.away_score !== undefined &&
      match.home_team_id &&
      match.away_team_id
    ) {
      const totals = computeEventPointTotals(
        match.match_events.map((event) => {
          const metadata = event.metadata;
          return {
            isPenaltyTry:
              event.is_penalty_try === true ||
              (typeof metadata === "object" &&
                metadata !== null &&
                !Array.isArray(metadata) &&
                (metadata as Record<string, unknown>).is_penalty_try === true),
            teamId: event.team_id ?? "",
            type: event.type,
          };
        }),
        {
          away: { id: match.away_team_id, name: match.away_team?.name ?? "" },
          home: { id: match.home_team_id, name: match.home_team?.name ?? "" },
        },
      );
      if (eventTotalsMatchFinalScore(totals, match)) ownerIds.add(match.id);
    }
  }
  const groups: CleanupPlanGroup[] = [];

  for (const group of findContaminatedEventGroups(matches)) {
    const targets = group.matches.filter(
      (match) =>
        !ownerIds.has(match.id) && !unknownScoreIds.has(match.id),
    );
    if (targets.length === 0) continue;
    groups.push({
      ...group,
      matches: targets,
      ownerIds: [],
      ownerMatches: group.matches.filter((match) => ownerIds.has(match.id)),
      source: "legacy",
    });
  }

  for (const group of structural) {
    const targets = group.contaminated
      .map((id) => rowsById.get(id))
      .filter((match): match is StructuralEventMatchRow => match !== undefined);
    if (targets.length === 0) continue;
    groups.push({
      eventCount: group.eventCount,
      matches: targets,
      ownerIds: group.owners,
      ownerMatches: group.owners
        .map((id) => rowsById.get(id))
        .filter((match): match is StructuralEventMatchRow => match !== undefined),
      publishedRecapCount: targets.filter(hasPublishedRecap).length,
      signature: group.signature,
      source: "structural",
    });
  }

  return groups;
}

function formatMatchEventTotals(match: CleanupMatchRow) {
  if (!match.home_team_id || !match.away_team_id) return "不明";
  const totals = computeEventPointTotals(
    match.match_events.map((event) => {
      const metadata = event.metadata;
      return {
        isPenaltyTry:
          event.is_penalty_try === true ||
          (typeof metadata === "object" &&
            metadata !== null &&
            !Array.isArray(metadata) &&
            (metadata as Record<string, unknown>).is_penalty_try === true),
        teamId: event.team_id ?? "",
        type: event.type,
      };
    }),
    {
      away: { id: match.away_team_id, name: match.away_team?.name ?? "" },
      home: { id: match.home_team_id, name: match.home_team?.name ?? "" },
    },
  );
  return `${totals.home}-${totals.away}`;
}

export function printGroups(groups: CleanupPlanGroup[]) {
  if (groups.length === 0) {
    console.log("No contaminated event groups detected.");
    return;
  }

  for (const [index, group] of groups.entries()) {
    console.log(
      `Group ${index + 1} (${group.source ?? "legacy"}): matches=${group.matches.length} events=${group.eventCount} published_recaps=${group.publishedRecapCount} signature=${group.signature}`,
    );
    if (group.source === "structural") {
      console.log(
        `  owners: ${group.ownerIds.length ? group.ownerIds.join(", ") : "持ち主なし"}`,
      );
    }

    for (const match of group.matches) {
      console.log(
        `  - ${match.kickoff_at.slice(0, 10)} ${match.home_team?.name ?? "Unknown"} vs ${match.away_team?.name ?? "Unknown"} (${match.id}) score=${match.home_score ?? "?"}-${match.away_score ?? "?"} event_total=${formatMatchEventTotals(match)} events=${match.match_events.length} published_recap=${hasPublishedRecap(match)}`,
      );
    }
    for (const owner of group.ownerMatches ?? []) {
      console.log(
        `  owner - ${owner.kickoff_at.slice(0, 10)} ${owner.home_team?.name ?? "Unknown"} vs ${owner.away_team?.name ?? "Unknown"} (${owner.id}) score=${owner.home_score ?? "?"}-${owner.away_score ?? "?"} event_total=${formatMatchEventTotals(owner)} events=${owner.match_events.length}`,
      );
    }
  }
}

export type CleanupBackupWriter = (
  matches: CleanupPlanGroup["matches"],
  timestamp: string,
) => Promise<void>;

export async function writeCleanupBackup(
  matches: CleanupPlanGroup["matches"],
  timestamp: string,
) {
  const directory = join("tmp", "contaminated-events-backup", timestamp);
  await mkdir(directory, { recursive: true });
  for (const match of matches) {
    await writeFile(
      join(directory, `${match.id}.json`),
      `${JSON.stringify({ matchId: match.id, events: match.match_events }, null, 2)}\n`,
      "utf8",
    );
  }
}

export async function applyCleanup(
  groups: CleanupPlanGroup[],
  client = getSupabaseServerClient(),
  options: {
    backup?: CleanupBackupWriter;
    now?: () => Date;
  } = {},
) {
  const owners = new Set(groups.flatMap((group) => group.ownerIds));
  const targets = [
    ...new Map(
      groups.flatMap((group) =>
        group.matches
          .filter((match) => !owners.has(match.id))
          .map((match) => [match.id, match] as const),
      ),
    ).values(),
  ];
  const matchIds = targets.map((match) => match.id);

  if (matchIds.length === 0) {
    return { demotedRecaps: 0, deletedEvents: 0, matchCount: 0 };
  }

  const timestamp = (options.now?.() ?? new Date()).toISOString();
  await (options.backup ?? writeCleanupBackup)(targets, timestamp);

  const deleteResult = await client
    .from("match_events")
    .delete()
    .in("match_id", matchIds)
    .select("id");
  if (deleteResult.error) throw deleteResult.error;

  const demoteResult = await client
    .from("match_content")
    .update({ status: "draft" })
    .in("match_id", matchIds)
    .eq("content_type", "recap")
    .eq("status", "published")
    .select("id");
  if (demoteResult.error) throw demoteResult.error;

  return {
    demotedRecaps: demoteResult.data?.length ?? 0,
    deletedEvents: deleteResult.data?.length ?? 0,
    matchCount: matchIds.length,
  };
}

export async function runCleanup(
  groups: CleanupPlanGroup[],
  ownerApproved: boolean,
  client = getSupabaseServerClient(),
  options: { backup?: CleanupBackupWriter; now?: () => Date } = {},
) {
  if (!ownerApproved) {
    return { demotedRecaps: 0, deletedEvents: 0, matchCount: 0 };
  }
  return applyCleanup(groups, client, options);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const matches = await loadFinishedMatchesWithEvents();
  const groups = findCleanupGroups(matches);
  printGroups(groups);

  const summary = await runCleanup(groups, options.ownerApproved);
  if (!options.ownerApproved) {
    console.log("[dry-run] No DELETE or UPDATE was executed.");
    return;
  }
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
