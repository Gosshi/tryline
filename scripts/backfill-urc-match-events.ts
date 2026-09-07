/**
 * Backfill URC match_events from Wikipedia season-page collapsible tables.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-urc-match-events.ts [--season=2025-26] [--dry-run] [--reparse-existing] [--confirm-owner-approved]
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseWikipediaUrcMatchDetailsHtml } from "@/lib/scrapers/wikipedia-urc-match-details";

import type { Json } from "@/lib/db/types";
import type { WikipediaClubMatchDetailSource } from "@/lib/scrapers/wikipedia-club-match-details";

type CliOptions = {
  dryRun: boolean;
  ownerApproved: boolean;
  reparseExisting: boolean;
  season: string | null;
};

type CompetitionRow = {
  id: string;
  season: string;
  slug: string;
};

type MatchRow = {
  away_team: { name: string } | null;
  away_team_id: string;
  competition_id: string;
  external_ids: Json;
  home_team: { name: string } | null;
  home_team_id: string;
  id: string;
  match_events: Array<{ id: string }>;
};

type WikipediaExternalIds = {
  wikipedia?: unknown;
  wikipedia_event_id?: unknown;
  wikipedia_url?: unknown;
};

const USAGE =
  "Usage: pnpm tsx scripts/backfill-urc-match-events.ts [--season=2025-26] [--dry-run] [--reparse-existing] [--confirm-owner-approved]";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let ownerApproved = false;
  let reparseExisting = false;
  let season: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
      continue;
    }

    if (arg === "--reparse-existing") {
      reparseExisting = true;
      continue;
    }

    if (arg === "--season") {
      season = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--season=")) {
      season = arg.slice("--season=".length);
      continue;
    }

    throw new Error(USAGE);
  }

  if (season !== null && !/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`Invalid --season value: ${season}`);
  }

  return { dryRun, ownerApproved, reparseExisting, season };
}

function isUrcSeasonUrl(url: string): boolean {
  return /^https:\/\/en\.wikipedia\.org\/wiki\/.+United_Rugby_Championship/.test(
    url,
  );
}

function getWikipediaSource(
  externalIds: Json,
): WikipediaClubMatchDetailSource | null {
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
  const eventId =
    typeof ids.wikipedia_event_id === "string"
      ? ids.wikipedia_event_id
      : null;

  if (!url || !eventId || !isUrcSeasonUrl(url)) {
    return null;
  }

  return { eventId, url };
}

export function shouldBackfillUrcMatch(
  match: Pick<MatchRow, "external_ids" | "match_events">,
  reparseExisting: boolean,
) {
  if (getWikipediaSource(match.external_ids) === null) {
    return false;
  }

  return reparseExisting || match.match_events.length === 0;
}

async function loadCompetitions(season: string | null) {
  const db = getSupabaseServerClient();
  let query = db
    .from("competitions")
    .select("id, season, slug")
    .eq("family", "urc")
    .order("season", { ascending: true });

  if (season) {
    query = query.eq("season", season);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as CompetitionRow[];
}

async function loadTargetMatches(
  competitions: CompetitionRow[],
  reparseExisting: boolean,
) {
  if (competitions.length === 0) {
    return [];
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        competition_id,
        external_ids,
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        match_events(id)
      `,
    )
    .eq("status", "finished")
    .in(
      "competition_id",
      competitions.map((competition) => competition.id),
    )
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as MatchRow[]).filter((match) =>
    shouldBackfillUrcMatch(match, reparseExisting),
  );
}

async function fetchSeasonHtml(
  cache: Map<string, string>,
  sourceUrl: string,
): Promise<string> {
  const cached = cache.get(sourceUrl);

  if (cached !== undefined) {
    return cached;
  }

  if (cache.size > 0) {
    await sleep(1_000);
  }

  const response = await fetchWithPolicy(sourceUrl);
  const html = await response.text();
  cache.set(sourceUrl, html);

  return html;
}

export async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options.dryRun && !options.ownerApproved) {
    throw new Error(
      "URC event backfill requires Owner approval. Re-run with --confirm-owner-approved after approval.",
    );
  }

  const competitions = await loadCompetitions(options.season);
  const matches = await loadTargetMatches(
    competitions,
    options.reparseExisting,
  );
  const competitionById = new Map(
    competitions.map((competition) => [competition.id, competition]),
  );
  const htmlCache = new Map<string, string>();

  console.log(
    options.reparseExisting
      ? `Target finished URC matches (reparse-existing): ${matches.length}`
      : `Target finished URC matches without events: ${matches.length}`,
  );

  let eventsFound = 0;
  let eventsInserted = 0;
  let skipped = 0;

  for (const match of matches) {
    const source = getWikipediaSource(match.external_ids);
    const competition = competitionById.get(match.competition_id);
    const homeTeamName = match.home_team?.name ?? "Unknown";
    const awayTeamName = match.away_team?.name ?? "Unknown";
    const label = `${competition?.season ?? "unknown-season"} ${homeTeamName} v ${awayTeamName}`;

    if (!source) {
      skipped += 1;
      console.warn(`[skip] ${label}: missing URC Wikipedia source`);
      continue;
    }

    let html: string;

    try {
      html = await fetchSeasonHtml(htmlCache, source.url);
    } catch (error) {
      skipped += 1;
      console.warn(`[skip] ${label}: unable to fetch ${source.url}`, error);
      continue;
    }

    const details = parseWikipediaUrcMatchDetailsHtml(html, source);
    eventsFound += details.events.length;

    if (details.events.length === 0) {
      skipped += 1;
      console.warn(`[skip] ${label}: no events parsed (${source.eventId})`);
      continue;
    }

    if (options.dryRun) {
      console.log(
        `[dry-run] ${label}: ${details.events.length} events (${source.eventId})`,
      );
      continue;
    }

    try {
      const result = await upsertMatchEvents({
        awayTeamId: match.away_team_id,
        events: details.events,
        homeTeamId: match.home_team_id,
        matchId: match.id,
      });

      eventsInserted += result.inserted;
      console.log(
        `Inserted ${result.inserted} events for ${label} (${source.url})`,
      );
    } catch (error) {
      skipped += 1;
      console.warn(`[skip] ${label}: unable to upsert events`, error);
    }
  }

  console.log(
    `Backfill URC match events complete: target_matches=${matches.length} events_found=${eventsFound} events_inserted=${eventsInserted} skipped=${skipped} dry_run=${options.dryRun} season_pages_fetched=${htmlCache.size}`,
  );
}

if (process.argv[1]?.endsWith("backfill-urc-match-events.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
