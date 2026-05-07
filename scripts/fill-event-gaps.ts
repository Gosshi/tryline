/**
 * Detect finished matches without scoring events and fill them from Wikipedia.
 *
 * Usage:
 *   pnpm tsx scripts/fill-event-gaps.ts [--dry-run] [--limit=50]
 */

import { load } from "cheerio";

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";

type CliOptions = {
  dryRun: boolean;
  limit: number;
};

type MatchGapRow = {
  away_team_id: string;
  away_team: { name: string } | null;
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

function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let limit = 50;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
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
      "Usage: pnpm tsx scripts/fill-event-gaps.ts [--dry-run] [--limit=50]",
    );
  }

  return { dryRun, limit };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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

function extractEventHtml(html: string, eventId: string | null): string {
  if (!eventId) {
    return html;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  return eventBlock.length ? $.html(eventBlock) : html;
}

async function loadGapMatches(limit: number): Promise<MatchGapRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        home_team_id,
        away_team_id,
        external_ids,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        match_events(id)
      `,
    )
    .eq("status", "finished")
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as MatchGapRow[]).filter(
    (match) =>
      match.match_events.length === 0 &&
      getWikipediaSource(match.external_ids) !== null,
  );
}

async function fillMatch(match: MatchGapRow): Promise<number> {
  const source = getWikipediaSource(match.external_ids);

  if (!source) {
    return 0;
  }

  const response = await fetchWithPolicy(source.url);
  const html = await response.text();
  const eventHtml = extractEventHtml(html, source.eventId);
  const events = parseMatchEventsFromVeventHtml(eventHtml);

  if (events.length === 0) {
    return 0;
  }

  const result = await upsertMatchEvents({
    awayTeamId: match.away_team_id,
    events,
    homeTeamId: match.home_team_id,
    matchId: match.id,
  });

  return result.inserted;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const gaps = await loadGapMatches(options.limit);

  console.log(`Found ${gaps.length} matches with missing events`);

  if (options.dryRun) {
    for (const match of gaps) {
      console.log(
        `[dry-run] ${match.home_team?.name ?? "Unknown"} vs ${match.away_team?.name ?? "Unknown"} (${match.id})`,
      );
    }
    return;
  }

  let filled = 0;

  for (const match of gaps) {
    const source = getWikipediaSource(match.external_ids);
    console.log(`Fetching ${source?.url ?? "missing Wikipedia URL"} ...`);

    try {
      const inserted = await fillMatch(match);

      if (inserted === 0) {
        console.log("  -> no events parsed, skipping");
        continue;
      }

      console.log(`  -> upserted ${inserted} events`);
      filled += 1;
    } catch (error) {
      console.error(`  -> error: ${String(error)}`);
    }

    await sleep(2_000);
  }

  console.log(`Done. Filled ${filled}/${gaps.length} matches.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
