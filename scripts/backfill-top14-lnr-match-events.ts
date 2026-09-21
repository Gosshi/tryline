import { getSupabaseServerClient } from "@/lib/db/server";
import {
  computeParsedMatchEventPointTotals,
  eventTotalsMatchFinalScore,
} from "@/lib/ingestion/event-integrity";
import {
  assertEventInsertionAccepted,
  EventInsertionRejectedError,
  upsertMatchEvents,
} from "@/lib/ingestion/events";
import { fetchTop14LnrMatchEvents } from "@/lib/scrapers/top14-lnr-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedPlayerMatchEvent } from "@/lib/scrapers/wikipedia-match-events";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_TOP14_LNR_MATCHES_PER_RUN = 7;
export const TOP14_LNR_MATCH_DELAY_MS = 3_000;
const TOP14_LNR_CANDIDATE_MATCH_LIMIT = 100;

type CliOptions = {
  dryRun: boolean;
  limit: number;
};

type TargetMatch = {
  away_score: number | null;
  away_team: { name: string } | null;
  away_team_id: string;
  external_ids: Json;
  home_score: number | null;
  home_team: { name: string } | null;
  home_team_id: string;
  id: string;
};

type Top14ExternalIds = { top14_lnr_match_path?: unknown };

type BackfillDeps = {
  fetchEvents?: (matchPath: string) => Promise<ParsedPlayerMatchEvent[]>;
  logger?: Pick<Console, "log" | "warn">;
  sleep?: (ms: number) => Promise<void>;
  upsertEvents?: typeof upsertMatchEvents;
};

const USAGE =
  "Usage: pnpm tsx scripts/backfill-top14-lnr-match-events.ts [--limit=7] [--dry-run]";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let limit = MAX_TOP14_LNR_MATCHES_PER_RUN;

  for (const argument of argv) {
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument.startsWith("--limit=")) {
      limit = Number(argument.slice("--limit=".length));
      continue;
    }
    throw new Error(USAGE);
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_TOP14_LNR_MATCHES_PER_RUN
  ) {
    throw new Error(
      `--limit must be an integer between 1 and ${MAX_TOP14_LNR_MATCHES_PER_RUN}`,
    );
  }

  return { dryRun, limit };
}

function getMatchPath(externalIds: Json): string | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const value = (externalIds as Top14ExternalIds).top14_lnr_match_path;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function loadTargetMatches(db: SupabaseClient, limit: number) {
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        external_ids,
        home_score,
        away_score,
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        competition:competitions!matches_competition_id_fkey!inner(family, season)
      `,
    )
    .eq("status", "finished")
    .eq("competition.family", "top-14")
    .eq("competition.season", "2026-27")
    .not("external_ids->>top14_lnr_match_path", "is", null)
    .order("kickoff_at", { ascending: false })
    .limit(TOP14_LNR_CANDIDATE_MATCH_LIMIT);

  if (error) throw error;

  const candidates = ((data ?? []) as unknown as TargetMatch[]).filter(
    (match) => getMatchPath(match.external_ids) !== null,
  );

  if (candidates.length === 0) {
    return [];
  }

  const { data: eventRows, error: eventError } = await db
    .from("match_events")
    .select("match_id")
    .in(
      "match_id",
      candidates.map((match) => match.id),
    );

  if (eventError) throw eventError;

  const existingMatchIds = new Set(
    ((eventRows ?? []) as Array<{ match_id: string }>).map(
      ({ match_id }) => match_id,
    ),
  );

  return candidates
    .filter((match) => !existingMatchIds.has(match.id))
    .slice(0, limit);
}

export async function runTop14LnrMatchEventBackfill(
  options: CliOptions,
  db: SupabaseClient = getSupabaseServerClient(),
  deps: BackfillDeps = {},
) {
  const fetchEvents = deps.fetchEvents ?? fetchTop14LnrMatchEvents;
  const logger = deps.logger ?? console;
  const wait = deps.sleep ?? sleep;
  const upsertEvents = deps.upsertEvents ?? upsertMatchEvents;
  const matches = await loadTargetMatches(db, options.limit);
  let eventsInserted = 0;
  const failedMatches: Array<{
    label: string;
    matchId: string;
    reason: string;
  }> = [];

  logger.log(
    `Target finished Top 14 matches without events: ${matches.length}`,
  );

  for (const [index, match] of matches.entries()) {
    const matchPath = getMatchPath(match.external_ids);
    if (!matchPath) continue;

    const label = `${match.home_team?.name ?? "Unknown"} v ${match.away_team?.name ?? "Unknown"}`;

    try {
      const events = await fetchEvents(matchPath);
      const totals = computeParsedMatchEventPointTotals(events);

      if (!eventTotalsMatchFinalScore(totals, match)) {
        throw new Error(
          `Top 14 event totals mismatch for ${match.id}: parsed=${totals.home}-${totals.away} final=${match.home_score}-${match.away_score}`,
        );
      }

      if (options.dryRun) {
        logger.log(
          `[dry-run] ${match.id} ${label}: ${events.length} events totals=${totals.home}-${totals.away} final=${match.home_score}-${match.away_score}`,
        );
      } else {
        try {
          const result = await upsertEvents({
            awayTeamId: match.away_team_id,
            events,
            homeTeamId: match.home_team_id,
            matchId: match.id,
          });
          assertEventInsertionAccepted(result);
          eventsInserted += result.inserted;
          logger.log(
            `Inserted ${result.inserted} events for ${match.id} ${label}`,
          );
        } catch (error) {
          if (error instanceof EventInsertionRejectedError) {
            logger.warn("Top 14 event insertion rejected", {
              matchId: match.id,
              rejected: error.rejected,
            });
          }
          throw error;
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failedMatches.push({ label, matchId: match.id, reason });
      logger.warn("Top 14 match event backfill failed", {
        label,
        matchId: match.id,
        reason,
      });
    }

    if (index < matches.length - 1) {
      await wait(TOP14_LNR_MATCH_DELAY_MS);
    }
  }

  return { eventsInserted, failedMatches, targetMatches: matches.length };
}

async function main() {
  const result = await runTop14LnrMatchEventBackfill(
    parseOptions(process.argv.slice(2)),
  );
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith("backfill-top14-lnr-match-events.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
