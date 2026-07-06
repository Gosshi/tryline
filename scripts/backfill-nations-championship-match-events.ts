/**
 * Backfill Nations Championship 2026 match_events from Wikipedia sub-articles.
 *
 * Dry-run is the default:
 *   node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-match-events.ts
 *
 * Apply only after Owner approval:
 *   node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-match-events.ts --confirm-owner-approved
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { pointsForMatchEvent } from "@/lib/format/match-event-points";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchNationsChampionship2026EventMatches } from "@/lib/ingestion/sources/wikipedia-nations-championship-events";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  ownerApproved: boolean;
  reparseExisting: boolean;
};

type MatchRow = {
  away_score: number | null;
  away_team: { name: string; slug: string } | null;
  away_team_id: string;
  external_ids: Json;
  home_score: number | null;
  home_team: { name: string; slug: string } | null;
  home_team_id: string;
  id: string;
  match_events: Array<{ id: string }>;
};

type EventMatchLookupEntry =
  | { match: ParsedLiveMatch; status: "unique" }
  | { matches: ParsedLiveMatch[]; status: "ambiguous" };

type EventPointTotals = {
  away: number;
  home: number;
};

type BackfillDeps = {
  fetchEventMatches?: () => Promise<ParsedLiveMatch[]>;
  logger?: Pick<Console, "log" | "warn">;
  parseEvents?: (rawHtml: string) => ParsedMatchEvent[];
  upsertEvents?: typeof upsertMatchEvents;
};

const COMPETITION_SLUG = "nations-championship-2026";
const USAGE =
  "Usage: node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-match-events.ts [--dry-run] [--reparse-existing] [--confirm-owner-approved]";

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = true;
  let ownerApproved = false;
  let reparseExisting = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      dryRun = false;
      ownerApproved = true;
      continue;
    }

    if (arg === "--reparse-existing") {
      reparseExisting = true;
      continue;
    }

    throw new Error(USAGE);
  }

  return { dryRun, ownerApproved, reparseExisting };
}

export function shouldBackfillNationsChampionshipMatch(
  match: Pick<MatchRow, "match_events">,
  reparseExisting: boolean,
) {
  return reparseExisting || match.match_events.length === 0;
}

export function buildTeamPairKey(params: {
  awayTeamSlug?: string | null;
  homeTeamSlug?: string | null;
}) {
  if (!params.homeTeamSlug || !params.awayTeamSlug) {
    return null;
  }

  return `${params.homeTeamSlug}:${params.awayTeamSlug}`;
}

export function buildEventMatchLookup(eventMatches: ParsedLiveMatch[]) {
  const lookup = new Map<string, EventMatchLookupEntry>();

  for (const eventMatch of eventMatches) {
    const key = buildTeamPairKey({
      awayTeamSlug: eventMatch.awayTeamSlug,
      homeTeamSlug: eventMatch.homeTeamSlug,
    });

    if (!key) {
      continue;
    }

    const existing = lookup.get(key);

    if (!existing) {
      lookup.set(key, { match: eventMatch, status: "unique" });
      continue;
    }

    lookup.set(key, {
      matches:
        existing.status === "ambiguous"
          ? [...existing.matches, eventMatch]
          : [existing.match, eventMatch],
      status: "ambiguous",
    });
  }

  return lookup;
}

export function computeEventPointTotals(
  events: ParsedMatchEvent[],
): EventPointTotals {
  return events.reduce<EventPointTotals>(
    (totals, event) => {
      const points = pointsForMatchEvent(event);

      if (event.teamSide === "home") {
        return { ...totals, home: totals.home + points };
      }

      return { ...totals, away: totals.away + points };
    },
    { away: 0, home: 0 },
  );
}

export function eventTotalsMatchFinalScore(
  totals: EventPointTotals,
  match: Pick<MatchRow, "away_score" | "home_score">,
) {
  return totals.home === match.home_score && totals.away === match.away_score;
}

async function loadTargetMatches(
  db: SupabaseClient,
  reparseExisting: boolean,
): Promise<MatchRow[]> {
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
        home_team:teams!matches_home_team_id_fkey(name, slug),
        away_team:teams!matches_away_team_id_fkey(name, slug),
        match_events(id),
        competition:competitions!matches_competition_id_fkey!inner(slug)
      `,
    )
    .eq("status", "finished")
    .eq("competition.slug", COMPETITION_SLUG)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as MatchRow[]).filter((match) =>
    shouldBackfillNationsChampionshipMatch(match, reparseExisting),
  );
}

export async function runBackfillNationsChampionshipMatchEvents(
  options: CliOptions,
  db: SupabaseClient = getSupabaseServerClient(),
  deps: BackfillDeps = {},
) {
  if (!options.dryRun && !options.ownerApproved) {
    throw new Error(
      "Nations Championship event backfill requires Owner approval. Re-run with --confirm-owner-approved after approval.",
    );
  }

  const logger = deps.logger ?? console;
  const fetchEventMatches =
    deps.fetchEventMatches ?? fetchNationsChampionship2026EventMatches;
  const parseEvents = deps.parseEvents ?? parseMatchEventsFromVeventHtml;
  const upsertEvents = deps.upsertEvents ?? upsertMatchEvents;
  const matches = await loadTargetMatches(db, options.reparseExisting);
  const eventMatches = await fetchEventMatches();
  const eventMatchByTeamPair = buildEventMatchLookup(eventMatches);
  let eventsFound = 0;
  let eventsInserted = 0;
  let skipped = 0;

  logger.log(
    options.reparseExisting
      ? `Target finished Nations Championship matches (reparse-existing): ${matches.length}`
      : `Target finished Nations Championship matches without events: ${matches.length}`,
  );

  for (const match of matches) {
    const key = buildTeamPairKey({
      awayTeamSlug: match.away_team?.slug,
      homeTeamSlug: match.home_team?.slug,
    });
    const eventMatchEntry = key ? eventMatchByTeamPair.get(key) : null;
    const label = `${match.home_team?.name ?? "Unknown"} v ${match.away_team?.name ?? "Unknown"}`;

    if (!eventMatchEntry) {
      skipped += 1;
      logger.warn(
        `[skip] ${label}: no unique Nations Championship event block`,
      );
      continue;
    }

    if (eventMatchEntry.status === "ambiguous") {
      skipped += 1;
      logger.warn(
        `[skip] ${label}: ambiguous Nations Championship event blocks (${eventMatchEntry.matches.length})`,
      );
      continue;
    }

    const events = parseEvents(eventMatchEntry.match.rawHtml);
    eventsFound += events.length;

    if (events.length === 0) {
      skipped += 1;
      logger.warn(`[skip] ${label}: no events parsed`);
      continue;
    }

    const totals = computeEventPointTotals(events);

    if (!eventTotalsMatchFinalScore(totals, match)) {
      skipped += 1;
      logger.warn(
        `[skip] ${label}: event totals mismatch (${totals.home}-${totals.away}) vs final score (${match.home_score ?? "null"}-${match.away_score ?? "null"})`,
      );
      continue;
    }

    if (options.dryRun) {
      logger.log(
        `[dry-run] ${label}: ${events.length} events totals=${totals.home}-${totals.away} final=${match.home_score}-${match.away_score}`,
      );
      continue;
    }

    const result = await upsertEvents({
      awayTeamId: match.away_team_id,
      events,
      homeTeamId: match.home_team_id,
      matchId: match.id,
    });
    eventsInserted += result.inserted;
    logger.log(`Inserted ${result.inserted} events for ${label}`);
  }

  return {
    dryRun: options.dryRun,
    eventMatches: eventMatches.length,
    eventsFound,
    eventsInserted,
    skipped,
    targetMatches: matches.length,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await runBackfillNationsChampionshipMatchEvents(options);

  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1]?.endsWith("backfill-nations-championship-match-events.ts")
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
