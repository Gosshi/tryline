/**
 * Detect and optionally delete null-minute scoring events that exactly
 * reconcile team-level event totals to final scores.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-phantom-null-minute-events.ts --family super-rugby-pacific --season 2026 [--confirm-owner-approved]
 */

import { pathToFileURL } from "node:url";

import { getSupabaseServerClient } from "@/lib/db/server";
import {
  pointsForPhantomEvent,
  reconcilePhantomNullMinuteScoringEvents,
} from "@/lib/ingestion/reconcile-phantom-events";

import type { Json } from "@/lib/db/types";
import type { PhantomScoringEvent } from "@/lib/ingestion/reconcile-phantom-events";

type CliOptions = {
  family: string;
  ownerApproved: boolean;
  season: string;
};

type CleanupEventRow = {
  id: string;
  metadata: Json;
  minute: number | null;
  team_id: string | null;
  type: string;
};

export type CleanupMatchRow = {
  away_score: number | null;
  away_team: { name: string } | null;
  away_team_id: string;
  competition: { family: string; name: string; season: string } | null;
  home_score: number | null;
  home_team: { name: string } | null;
  home_team_id: string;
  id: string;
  kickoff_at: string;
  match_events: CleanupEventRow[];
};

type CleanupTeamSide = "away" | "home" | "unknown";

export type PhantomCleanupRemoval = {
  actual: number;
  afterImplied: number;
  eventIds: string[];
  implied: number;
  matchId: string;
  teamName: string;
  teamSide: CleanupTeamSide;
};

export type PhantomCleanupNeedsReview = {
  actual: number | null;
  eventIds: string[];
  implied: number;
  matchId: string;
  reason: "ambiguous_or_unmatched_overcount" | "unknown_team_scoring_event";
  teamName: string;
  teamSide: CleanupTeamSide;
};

export type PhantomCleanupPlan = {
  needsReview: PhantomCleanupNeedsReview[];
  removals: PhantomCleanupRemoval[];
};

type ReconciliationEvent = CleanupEventRow &
  PhantomScoringEvent & {
    isPenaltyTry: boolean;
  };

const USAGE =
  "Usage: pnpm tsx scripts/cleanup-phantom-null-minute-events.ts --family <slug> --season <season> [--confirm-owner-approved]";

function readOptionValue(
  argv: string[],
  index: number,
  prefix: "--family" | "--season",
): { nextIndex: number; value: string } {
  const arg = argv[index]!;
  const inlinePrefix = `${prefix}=`;

  if (arg.startsWith(inlinePrefix)) {
    return { nextIndex: index, value: arg.slice(inlinePrefix.length) };
  }

  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(USAGE);
  }

  return { nextIndex: index + 1, value: next };
}

export function parseOptions(argv: string[]): CliOptions {
  let family = "";
  let ownerApproved = false;
  let season = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;

    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
      continue;
    }

    if (arg === "--dry-run") {
      continue;
    }

    if (arg === "--family" || arg.startsWith("--family=")) {
      const parsed = readOptionValue(argv, index, "--family");
      family = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--season" || arg.startsWith("--season=")) {
      const parsed = readOptionValue(argv, index, "--season");
      season = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    throw new Error(USAGE);
  }

  if (!family || !season) {
    throw new Error(USAGE);
  }

  return { family, ownerApproved, season };
}

function metadataIsPenaltyTry(metadata: Json): boolean {
  return (
    Boolean(metadata) &&
    !Array.isArray(metadata) &&
    typeof metadata === "object" &&
    (metadata as { is_penalty_try?: unknown }).is_penalty_try === true
  );
}

function toReconciliationEvent(event: CleanupEventRow): ReconciliationEvent {
  return {
    ...event,
    isPenaltyTry: metadataIsPenaltyTry(event.metadata),
  };
}

function teamName(match: CleanupMatchRow, side: CleanupTeamSide): string {
  if (side === "home") {
    return match.home_team?.name ?? "Home";
  }

  if (side === "away") {
    return match.away_team?.name ?? "Away";
  }

  return "Unknown";
}

function buildTeamPlan(params: {
  actual: number | null;
  events: ReconciliationEvent[];
  match: CleanupMatchRow;
  teamSide: Exclude<CleanupTeamSide, "unknown">;
}): PhantomCleanupPlan {
  const result = reconcilePhantomNullMinuteScoringEvents(
    params.events,
    params.actual,
  );

  if (result.status === "reconciled" && params.actual !== null) {
    return {
      needsReview: [],
      removals: [
        {
          actual: params.actual,
          afterImplied: result.afterImplied,
          eventIds: result.remove.map((event) => event.id),
          implied: result.implied,
          matchId: params.match.id,
          teamName: teamName(params.match, params.teamSide),
          teamSide: params.teamSide,
        },
      ],
    };
  }

  if (result.status === "needs_review") {
    return {
      needsReview: [
        {
          actual: params.actual,
          eventIds: params.events
            .filter((event) => event.minute === null)
            .map((event) => event.id),
          implied: result.implied,
          matchId: params.match.id,
          reason: "ambiguous_or_unmatched_overcount",
          teamName: teamName(params.match, params.teamSide),
          teamSide: params.teamSide,
        },
      ],
      removals: [],
    };
  }

  return { needsReview: [], removals: [] };
}

export function buildPhantomCleanupPlan(
  matches: CleanupMatchRow[],
): PhantomCleanupPlan {
  const plan: PhantomCleanupPlan = { needsReview: [], removals: [] };

  for (const match of matches) {
    const events = match.match_events.map(toReconciliationEvent);
    const unknownTeamScoringEvents = events.filter(
      (event) => event.team_id === null && pointsForPhantomEvent(event) > 0,
    );

    if (unknownTeamScoringEvents.length > 0) {
      plan.needsReview.push({
        actual: null,
        eventIds: unknownTeamScoringEvents.map((event) => event.id),
        implied: unknownTeamScoringEvents.reduce(
          (sum, event) => sum + pointsForPhantomEvent(event),
          0,
        ),
        matchId: match.id,
        reason: "unknown_team_scoring_event",
        teamName: teamName(match, "unknown"),
        teamSide: "unknown",
      });
    }

    const homePlan = buildTeamPlan({
      actual: match.home_score,
      events: events.filter((event) => event.team_id === match.home_team_id),
      match,
      teamSide: "home",
    });
    const awayPlan = buildTeamPlan({
      actual: match.away_score,
      events: events.filter((event) => event.team_id === match.away_team_id),
      match,
      teamSide: "away",
    });

    plan.removals.push(...homePlan.removals, ...awayPlan.removals);
    plan.needsReview.push(...homePlan.needsReview, ...awayPlan.needsReview);
  }

  return plan;
}

async function loadFinishedMatches(options: CliOptions): Promise<CleanupMatchRow[]> {
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
        competition:competitions!matches_competition_id_fkey!inner(
          family,
          name,
          season
        ),
        match_events(id, type, minute, team_id, metadata)
      `,
    )
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .eq("competition.family", options.family)
    .eq("competition.season", options.season)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as CleanupMatchRow[];
}

function printPlan(plan: PhantomCleanupPlan) {
  console.log(
    `Reconciled removals: ${plan.removals.length}; needs_review: ${plan.needsReview.length}`,
  );

  for (const removal of plan.removals) {
    console.log(
      `[remove] match=${removal.matchId} team=${removal.teamSide}:${removal.teamName} implied=${removal.implied} actual=${removal.actual} after=${removal.afterImplied} events=${removal.eventIds.join(",")}`,
    );
  }

  for (const item of plan.needsReview) {
    console.log(
      `[needs_review] match=${item.matchId} team=${item.teamSide}:${item.teamName} reason=${item.reason} implied=${item.implied} actual=${item.actual ?? "unknown"} events=${item.eventIds.join(",")}`,
    );
  }
}

export async function applyPhantomCleanup(plan: PhantomCleanupPlan) {
  const eventIds = [
    ...new Set(plan.removals.flatMap((removal) => removal.eventIds)),
  ];

  if (eventIds.length === 0) {
    return { deletedEvents: 0 };
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("match_events")
    .delete()
    .in("id", eventIds)
    .select("id");

  if (error) {
    throw error;
  }

  return { deletedEvents: data?.length ?? 0 };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const matches = await loadFinishedMatches(options);
  const plan = buildPhantomCleanupPlan(matches);

  console.log(
    `Phantom null-minute event cleanup scope: family=${options.family} season=${options.season} matches=${matches.length}`,
  );
  printPlan(plan);

  if (!options.ownerApproved) {
    console.log("[dry-run] No DELETE was executed.");
    return;
  }

  const result = await applyPhantomCleanup(plan);
  console.log(`Deleted ${result.deletedEvents} match_events rows.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
