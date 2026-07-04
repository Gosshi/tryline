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
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchNationsChampionship2026EventMatches } from "@/lib/ingestion/sources/wikipedia-nations-championship-events";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  ownerApproved: boolean;
  reparseExisting: boolean;
};

type MatchRow = {
  away_team: { name: string; slug: string } | null;
  away_team_id: string;
  external_ids: Json;
  home_team: { name: string; slug: string } | null;
  home_team_id: string;
  id: string;
  match_events: Array<{ id: string }>;
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

function buildTeamPairKey(params: {
  awayTeamSlug?: string | null;
  homeTeamSlug?: string | null;
}) {
  if (!params.homeTeamSlug || !params.awayTeamSlug) {
    return null;
  }

  return `${params.homeTeamSlug}:${params.awayTeamSlug}`;
}

function buildEventMatchLookup(eventMatches: ParsedLiveMatch[]) {
  const lookup = new Map<string, ParsedLiveMatch>();

  for (const eventMatch of eventMatches) {
    const key = buildTeamPairKey({
      awayTeamSlug: eventMatch.awayTeamSlug,
      homeTeamSlug: eventMatch.homeTeamSlug,
    });

    if (key) {
      lookup.set(key, eventMatch);
    }
  }

  return lookup;
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
) {
  if (!options.dryRun && !options.ownerApproved) {
    throw new Error(
      "Nations Championship event backfill requires Owner approval. Re-run with --confirm-owner-approved after approval.",
    );
  }

  const matches = await loadTargetMatches(db, options.reparseExisting);
  const eventMatches = await fetchNationsChampionship2026EventMatches();
  const eventMatchByTeamPair = buildEventMatchLookup(eventMatches);
  let eventsFound = 0;
  let eventsInserted = 0;
  let skipped = 0;

  console.log(
    options.reparseExisting
      ? `Target finished Nations Championship matches (reparse-existing): ${matches.length}`
      : `Target finished Nations Championship matches without events: ${matches.length}`,
  );

  for (const match of matches) {
    const key = buildTeamPairKey({
      awayTeamSlug: match.away_team?.slug,
      homeTeamSlug: match.home_team?.slug,
    });
    const eventMatch = key ? eventMatchByTeamPair.get(key) : null;
    const label = `${match.home_team?.name ?? "Unknown"} v ${match.away_team?.name ?? "Unknown"}`;

    if (!eventMatch) {
      skipped += 1;
      console.warn(`[skip] ${label}: no Nations Championship event block`);
      continue;
    }

    const events = parseMatchEventsFromVeventHtml(eventMatch.rawHtml);
    eventsFound += events.length;

    if (events.length === 0) {
      skipped += 1;
      console.warn(`[skip] ${label}: no events parsed`);
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${label}: ${events.length} events`);
      continue;
    }

    const result = await upsertMatchEvents({
      awayTeamId: match.away_team_id,
      events,
      homeTeamId: match.home_team_id,
      matchId: match.id,
    });
    eventsInserted += result.inserted;
    console.log(`Inserted ${result.inserted} events for ${label}`);
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
