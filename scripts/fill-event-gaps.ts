/**
 * Detect finished matches without scoring events and fill them from Wikipedia.
 *
 * Usage:
 *   pnpm tsx scripts/fill-event-gaps.ts [--dry-run] [--limit=50]
 */

import { load } from "cheerio";
import { pathToFileURL } from "node:url";

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

type CliOptions = {
  dryRun: boolean;
  limit: number;
};

type MatchGapRow = {
  away_score: number | null;
  away_team_id: string;
  away_team: { english_name: string | null; name: string } | null;
  competition: { family: string; season: string } | null;
  external_ids: Json;
  home_score: number | null;
  home_team_id: string;
  home_team: { english_name: string | null; name: string } | null;
  id: string;
  kickoff_at: string | null;
  match_events: Array<{ id: string }>;
};

type WikipediaExternalIds = {
  wikipedia?: unknown;
  wikipedia_event_id?: unknown;
  wikipedia_url?: unknown;
};

const EVENT_POINTS: Record<string, number> = {
  conversion: 2,
  drop_goal: 3,
  penalty_goal: 3,
  try: 5,
};

export function parseOptions(argv: string[]): CliOptions {
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

function buildSuperRugbyPacificListUrl(season: string): string | null {
  if (!/^\d{4}$/.test(season)) {
    return null;
  }

  return `https://en.wikipedia.org/wiki/List_of_${season}_Super_Rugby_Pacific_matches`;
}

function buildLeagueOneEnglishUrl(season: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    return null;
  }

  return `https://en.wikipedia.org/wiki/${season}_Japan_Rugby_League_One_%E2%80%93_Division_1`;
}

function normalizeWikipediaUrl(match: MatchGapRow, url: string | null) {
  const family = match.competition?.family;
  const season = match.competition?.season;

  if (family === "super-rugby-pacific" && season) {
    const listUrl = buildSuperRugbyPacificListUrl(season);

    if (
      listUrl &&
      (!url || /\/wiki\/\d{4}_Super_Rugby_Pacific_season$/.test(url))
    ) {
      return listUrl;
    }
  }

  if (family === "league-one" && season && url?.startsWith("https://es.wikipedia.org/")) {
    return buildLeagueOneEnglishUrl(season) ?? url;
  }

  if (
    family === "rwc" &&
    url?.includes("2023_Rugby_World_Cup_third-place_play-off")
  ) {
    return "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup";
  }

  return url;
}

function getWikipediaSource(match: MatchGapRow) {
  const { external_ids: externalIds } = match;

  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const ids = externalIds as WikipediaExternalIds;
  const rawUrl =
    typeof ids.wikipedia_url === "string"
      ? ids.wikipedia_url
      : typeof ids.wikipedia === "string"
        ? ids.wikipedia
        : null;
  const url = normalizeWikipediaUrl(match, rawUrl);

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

export function extractEventHtml(
  html: string,
  eventId: string | null,
): string | null {
  if (!eventId || eventId === "mw-content-text") {
    return null;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  return eventBlock.length ? $.html(eventBlock) : null;
}

const MONTH_INDEX_BY_NAME = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index]),
);

function toUtcDay(value: Date) {
  return Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  );
}

function parseEnglishDateToUtcDay(
  day: string,
  month: string,
  year: string,
): number | null {
  const monthIndex = MONTH_INDEX_BY_NAME.get(month.toLowerCase());
  if (monthIndex === undefined) {
    return null;
  }

  return Date.UTC(Number(year), monthIndex, Number(day));
}

function extractEnglishDateDays(text: string): number[] {
  const days = new Set<number>();
  const dayMonthYear =
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi;
  const monthDayYear =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi;

  for (const match of text.matchAll(dayMonthYear)) {
    const day = parseEnglishDateToUtcDay(match[1]!, match[2]!, match[3]!);
    if (day !== null) {
      days.add(day);
    }
  }

  for (const match of text.matchAll(monthDayYear)) {
    const day = parseEnglishDateToUtcDay(match[2]!, match[1]!, match[3]!);
    if (day !== null) {
      days.add(day);
    }
  }

  return Array.from(days);
}

function blockContainsDate(blockHtml: string, kickoffDate: string): boolean {
  const kickoffDay = toUtcDay(new Date(`${kickoffDate}T00:00:00Z`));
  if (!Number.isFinite(kickoffDay)) {
    return false;
  }

  const $ = load(blockHtml);
  const blockDays = extractEnglishDateDays($.text());
  const oneDay = 24 * 60 * 60 * 1000;

  return blockDays.some((blockDay) => Math.abs(blockDay - kickoffDay) <= oneDay);
}

export function findEventBlockByTeams(
  html: string,
  homeTeamName: string,
  awayTeamName: string,
  kickoffDate: string,
): string | null {
  const $ = load(html);
  const blocks: string[] = [];

  $(".vevent").each((_, element) => {
    const block = $.html(element);
    if (block) {
      blocks.push(block);
    }
  });

  const strictCandidates = blocks.filter(
    (block) =>
      block.includes(`${homeTeamName} national rugby union team`) &&
      block.includes(`${awayTeamName} national rugby union team`),
  );

  if (strictCandidates.length === 1) {
    return strictCandidates[0] ?? null;
  }

  if (strictCandidates.length > 1) {
    const strictDateMatches = strictCandidates.filter((block) =>
      blockContainsDate(block, kickoffDate),
    );
    return strictDateMatches.length === 1
      ? (strictDateMatches[0] ?? null)
      : null;
  }

  const looseCandidateBlocks = blocks.filter(
    (block) => !block.includes(" national rugby union team"),
  );
  const looseCandidates = looseCandidateBlocks.filter(
    (block) => block.includes(homeTeamName) && block.includes(awayTeamName),
  );

  if (looseCandidates.length === 1) {
    return looseCandidates[0] ?? null;
  }

  const dateMatches = looseCandidates.filter((block) =>
    blockContainsDate(block, kickoffDate),
  );

  return dateMatches.length === 1 ? (dateMatches[0] ?? null) : null;
}

export function eventTotalsExceedFinalScore(
  events: ParsedMatchEvent[],
  match: Pick<MatchGapRow, "away_score" | "home_score">,
): { awayTotal: number; homeTotal: number; exceeds: boolean } {
  const homeTotal = events
    .filter((event) => event.teamSide === "home")
    .reduce((sum, event) => sum + (EVENT_POINTS[event.type] ?? 0), 0);
  const awayTotal = events
    .filter((event) => event.teamSide === "away")
    .reduce((sum, event) => sum + (EVENT_POINTS[event.type] ?? 0), 0);

  return {
    awayTotal,
    exceeds:
      (match.home_score !== null && homeTotal > match.home_score) ||
      (match.away_score !== null && awayTotal > match.away_score),
    homeTotal,
  };
}

async function loadGapMatches(limit: number): Promise<MatchGapRow[]> {
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
        external_ids,
        competition:competitions!matches_competition_id_fkey(family, season),
        home_team:teams!matches_home_team_id_fkey(name, english_name),
        away_team:teams!matches_away_team_id_fkey(name, english_name),
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
      getWikipediaSource(match) !== null,
  );
}

async function fillMatch(match: MatchGapRow): Promise<number> {
  const source = getWikipediaSource(match);

  if (!source) {
    return 0;
  }

  const response = await fetchWithPolicy(source.url);
  const html = await response.text();
  let eventHtml = extractEventHtml(html, source.eventId);
  if (eventHtml === null) {
    const homeTeamName = match.home_team?.english_name ?? match.home_team?.name;
    const awayTeamName = match.away_team?.english_name ?? match.away_team?.name;
    const kickoffDate = match.kickoff_at?.slice(0, 10);

    if (homeTeamName && awayTeamName && kickoffDate) {
      eventHtml = findEventBlockByTeams(
        html,
        homeTeamName,
        awayTeamName,
        kickoffDate,
      );
    }

    if (eventHtml === null) {
      console.log("  -> no unique event block found, skipping");
      return 0;
    }

    console.log("  -> resolved by team-name block selection");
  }

  const events = parseMatchEventsFromVeventHtml(eventHtml);

  if (events.length === 0) {
    return 0;
  }

  const totals = eventTotalsExceedFinalScore(events, match);
  if (totals.exceeds) {
    console.warn(
      `  -> event totals exceed final score (${totals.homeTotal}-${totals.awayTotal} vs ${match.home_score}-${match.away_score}), skipping`,
    );
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
    const source = getWikipediaSource(match);
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
      console.warn(`  -> warning: ${String(error)}; skipping`);
    }

    await sleep(2_000);
  }

  console.log(`Done. Filled ${filled}/${gaps.length} matches.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
