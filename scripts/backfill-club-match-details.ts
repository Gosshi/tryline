/**
 * Backfill club match scoring events from Wikipedia season pages.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-club-match-details.ts [--family=premiership] [--dry-run] [--limit=50]
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import {
  scrapeWikipediaClubMatchDetails,
  type WikipediaClubMatchDetails,
} from "@/lib/scrapers/wikipedia-club-match-details";

import type { Json } from "@/lib/db/types";

type CliOptions = {
  dryRun: boolean;
  family: string | null;
  limit: number;
};

type MatchRow = {
  away_team_id: string;
  away_team: { name: string } | null;
  competition: { family: string; season: string; slug: string } | null;
  external_ids: Json;
  home_team_id: string;
  home_team: { name: string } | null;
  id: string;
  match_events: Array<{ id: string }>;
};

type WikipediaExternalIds = {
  wikipedia?: unknown;
  wikipedia_event_id?: unknown;
  wikipedia_url?: unknown;
};

const CLUB_FAMILIES = [
  "premiership",
  "urc",
  "top-14",
  "super-rugby-pacific",
] as const;

function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let family: string | null = null;
  let limit = 50;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--family=")) {
      family = arg.slice("--family=".length);
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);

      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }

      limit = parsed;
      continue;
    }

    throw new Error(
      "Usage: pnpm tsx scripts/backfill-club-match-details.ts [--family=premiership] [--dry-run] [--limit=50]",
    );
  }

  if (family && !CLUB_FAMILIES.includes(family as (typeof CLUB_FAMILIES)[number])) {
    throw new Error(`Unsupported --family value: ${family}`);
  }

  return { dryRun, family, limit };
}

function getWikipediaSource(externalIds: Json) {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const ids = externalIds as WikipediaExternalIds;
  const url =
    typeof ids.wikipedia_url === "string"
      ? ids.wikipedia_url
      : typeof ids.wikipedia === "string"
        ? ids.wikipedia
        : null;

  if (!url) {
    return null;
  }

  return {
    eventId:
      typeof ids.wikipedia_event_id === "string"
        ? ids.wikipedia_event_id
        : null,
    url,
  };
}

async function loadTargetMatches(options: CliOptions): Promise<MatchRow[]> {
  const db = getSupabaseServerClient();
  let query = db
    .from("matches")
    .select(
      `
        id,
        home_team_id,
        away_team_id,
        external_ids,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        competition:competitions!matches_competition_id_fkey(family, season, slug),
        match_events(id)
      `,
    )
    .eq("status", "finished")
    .limit(options.limit);

  if (options.family) {
    query = query.eq("competition.family", options.family);
  } else {
    query = query.in("competition.family", [...CLUB_FAMILIES]);
  }

  const { data, error } = await query.order("kickoff_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as MatchRow[]).filter((match) => {
    if (!match.competition || !getWikipediaSource(match.external_ids)) {
      return false;
    }

    return match.match_events.length === 0;
  });
}

async function persistDetails(match: MatchRow, details: WikipediaClubMatchDetails) {
  let eventsInserted = 0;

  if (match.match_events.length === 0 && details.events.length > 0) {
    const upserted = await upsertMatchEvents({
      awayTeamId: match.away_team_id,
      events: details.events,
      homeTeamId: match.home_team_id,
      matchId: match.id,
    });
    eventsInserted = upserted.inserted;
  }

  return { eventsInserted };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const matches = await loadTargetMatches(options);
  let eventsInserted = 0;
  let skipped = 0;

  console.log(`Found ${matches.length} club matches with missing details`);

  for (const match of matches) {
    const source = getWikipediaSource(match.external_ids);
    const label = `${match.competition?.slug ?? "unknown"} ${match.home_team?.name ?? "Unknown"} v ${match.away_team?.name ?? "Unknown"}`;

    if (!source) {
      skipped += 1;
      console.warn(`[skip] ${label}: missing Wikipedia source`);
      continue;
    }

    const details = await scrapeWikipediaClubMatchDetails(source);

    if (options.dryRun) {
      console.log(
        `[dry-run] ${label}: events=${details.events.length}`,
      );
      continue;
    }

    const result = await persistDetails(match, details);

    if (result.eventsInserted === 0) {
      skipped += 1;
    }

    eventsInserted += result.eventsInserted;
    console.log(`[ok] ${label}: events=${result.eventsInserted}`);
  }

  console.log(
    `Backfill complete: matches=${matches.length} events=${eventsInserted} lineups=skipped skipped=${skipped} dry_run=${options.dryRun}`,
  );
}

if (process.argv[1]?.endsWith("backfill-club-match-details.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
