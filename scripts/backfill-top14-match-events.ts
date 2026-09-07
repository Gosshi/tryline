/**
 * Backfill Top 14 match_events from Wikipedia season-page vevent blocks.
 *
 * Research note:
 * - The 2024-25 Top 14 season page includes vevent.summary blocks with scoring detail rows.
 * - Those rows use the same Try/Con/Pen markup parsed by parseMatchEventsFromVeventHtml().
 * - Top 14 vevent blocks do not carry stable per-match ids, so matching uses:
 *   sectionId (stored in external_ids.wikipedia_event_id) + teams + kickoff date.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-top14-match-events.ts [--season=2024-25] [--dry-run]
 */

import { load } from "cheerio";

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";
import {
  parseWikipediaSeasonMatches,
  type WikipediaSeasonMatch,
} from "@/lib/scrapers/wikipedia-season-parser";
import { mapWikipediaTeamName } from "@/lib/scrapers/wikipedia-team-name-map";

import type { Json } from "@/lib/db/types";

type CliOptions = {
  dryRun: boolean;
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
  kickoff_at: string;
  match_events: Array<{ id: string }>;
};

type MatchExternalIds = {
  wikipedia_event_id?: unknown;
};

type Top14SeasonEntry = WikipediaSeasonMatch & {
  rawHtml: string;
};

const USAGE =
  "Usage: pnpm tsx scripts/backfill-top14-match-events.ts [--season=2024-25] [--dry-run]";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let season: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
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

  return { dryRun, season };
}

function buildWikipediaUrl(slug: string): string {
  const season = slug.replace(/^top-14-/, "");

  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`Unable to derive Top 14 season from slug: ${slug}`);
  }

  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Top_14_season`;
}

function getWikipediaEventId(externalIds: Json): string | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const value = (externalIds as MatchExternalIds).wikipedia_event_id;

  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeComparableName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function wikiTeamMatchesDbTeam(wikiName: string, dbName: string): boolean {
  const mapped = normalizeComparableName(mapWikipediaTeamName(wikiName));
  const db = normalizeComparableName(dbName);
  const raw = normalizeComparableName(wikiName);

  return db === mapped || db === raw || db.includes(mapped) || db.includes(raw);
}

function sameMatchDate(sourceDateKey: string | null, kickoffAt: string): boolean {
  return !sourceDateKey || kickoffAt.slice(0, 10) === sourceDateKey;
}

export function buildSeasonEntries(html: string): Top14SeasonEntry[] {
  const parsed = parseWikipediaSeasonMatches(html);
  const $ = load(html);
  const vevents = $("div.vevent").toArray();
  const rawHtmls = vevents.map((element) => $.html(element) ?? "");

  return parsed
    .map((entry, index) => {
      const event = $(vevents[index]!);
      const fallbackSectionId = event
        .prevAll(".mw-heading")
        .first()
        .find("[id]")
        .first()
        .attr("id");

      return {
        ...entry,
        rawHtml: rawHtmls[index] ?? "",
        sectionId: entry.sectionId ?? fallbackSectionId ?? null,
      };
    })
    .filter((entry) => entry.rawHtml.length > 0);
}

export function matchSeasonEntryToRow(
  row: MatchRow,
  seasonEntries: Top14SeasonEntry[],
): Top14SeasonEntry | null {
  const wikipediaEventId = getWikipediaEventId(row.external_ids);

  if (!wikipediaEventId || !row.home_team || !row.away_team) {
    return null;
  }

  const candidates = seasonEntries.filter((entry) => {
    return (
      entry.sectionId === wikipediaEventId &&
      wikiTeamMatchesDbTeam(entry.homeTeamName, row.home_team!.name) &&
      wikiTeamMatchesDbTeam(entry.awayTeamName, row.away_team!.name) &&
      sameMatchDate(entry.dateKey, row.kickoff_at)
    );
  });

  return candidates.length === 1 ? candidates[0]! : null;
}

async function loadCompetitions(season: string | null) {
  const client = getSupabaseServerClient();
  let query = client
    .from("competitions")
    .select("id, season, slug")
    .like("slug", "top-14-%")
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

async function loadTargetMatches(competitions: CompetitionRow[]) {
  if (competitions.length === 0) {
    return [];
  }

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
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

  return ((data ?? []) as MatchRow[]).filter(
    (match) =>
      match.match_events.length === 0 && getWikipediaEventId(match.external_ids),
  );
}

async function fetchSeasonEntries(competition: CompetitionRow) {
  const sourceUrl = buildWikipediaUrl(competition.slug);
  const response = await fetchWithPolicy(sourceUrl);
  const html = await response.text();

  return {
    entries: buildSeasonEntries(html),
    sourceUrl,
  };
}

export async function main() {
  const options = parseOptions(process.argv.slice(2));
  const competitions = await loadCompetitions(options.season);
  const matches = await loadTargetMatches(competitions);
  const matchesByCompetition = new Map<string, MatchRow[]>();

  for (const match of matches) {
    const group = matchesByCompetition.get(match.competition_id) ?? [];
    group.push(match);
    matchesByCompetition.set(match.competition_id, group);
  }

  console.log(`Target finished Top 14 matches without events: ${matches.length}`);

  let eventsFound = 0;
  let eventsInserted = 0;
  let firstSeason = true;

  for (const competition of competitions) {
    const competitionMatches = matchesByCompetition.get(competition.id) ?? [];

    if (competitionMatches.length === 0) {
      continue;
    }

    if (!firstSeason) {
      await sleep(1_000);
    }
    firstSeason = false;

    let seasonEvents: Awaited<ReturnType<typeof fetchSeasonEntries>>;
    try {
      seasonEvents = await fetchSeasonEntries(competition);
    } catch (error) {
      console.warn(
        `Unable to fetch Top 14 season page for ${competition.slug}:`,
        error,
      );
      continue;
    }

    for (const match of competitionMatches) {
      const homeTeamName = match.home_team?.name ?? "Unknown";
      const awayTeamName = match.away_team?.name ?? "Unknown";
      const seasonEntry = matchSeasonEntryToRow(match, seasonEvents.entries);

      if (!seasonEntry) {
        console.warn(
          `No Top 14 vevent found for ${competition.season} ${homeTeamName} v ${awayTeamName} (${match.id})`,
        );
        continue;
      }

      try {
        const events = parseMatchEventsFromVeventHtml(seasonEntry.rawHtml);
        eventsFound += events.length;

        if (options.dryRun) {
          console.log(
            `[dry-run] ${competition.season} ${homeTeamName} v ${awayTeamName}: ${events.length} events`,
          );
          continue;
        }

        const result = await upsertMatchEvents({
          awayTeamId: match.away_team_id,
          events,
          homeTeamId: match.home_team_id,
          matchId: match.id,
        });

        eventsInserted += result.inserted;
        console.log(
          `Inserted ${result.inserted} events for ${competition.season} ${homeTeamName} v ${awayTeamName} (${seasonEvents.sourceUrl})`,
        );
      } catch (error) {
        console.warn(
          `Unable to backfill Top 14 events for ${competition.season} ${homeTeamName} v ${awayTeamName}:`,
          error,
        );
      }
    }
  }

  console.log(
    `Backfill Top 14 match events complete: target_matches=${matches.length} events_found=${eventsFound} events_inserted=${eventsInserted} dry_run=${options.dryRun}`,
  );
}

if (process.argv[1]?.endsWith("backfill-top14-match-events.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
