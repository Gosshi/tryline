import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { parsePremiershipLiveHtml } from "@/lib/ingestion/sources/wikipedia-premiership";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

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
  away_team_id: string;
  away_team: { name: string } | null;
  competition_id: string;
  external_ids: Json;
  home_team_id: string;
  home_team: { name: string } | null;
  id: string;
  match_events: Array<{ id: string }>;
};

type MatchExternalIds = {
  wikipedia_event_id?: unknown;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printUsageAndExit(): never {
  console.error(
    "Usage: pnpm tsx scripts/backfill-premiership-match-events.ts [--season=2025-26] [--dry-run]",
  );
  process.exit(1);
}

function parseOptions(argv: string[]): CliOptions {
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

    printUsageAndExit();
  }

  if (season !== null && !/^\d{4}-\d{2}$/.test(season)) {
    console.error(`Invalid --season value: ${season}`);
    printUsageAndExit();
  }

  return { dryRun, season };
}

function buildWikipediaUrl(slug: string): string {
  const season = slug.replace(/^premiership-/, "");

  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`Unable to derive Premiership season from slug: ${slug}`);
  }

  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Premiership_Rugby`;
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

async function loadCompetitions(season: string | null) {
  const client = getSupabaseServerClient();
  let query = client
    .from("competitions")
    .select("id, season, slug")
    .like("slug", "premiership-%")
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
    (match) => match.match_events.length === 0,
  );
}

function buildVeventById(matches: ParsedLiveMatch[]) {
  const byId = new Map<string, string>();

  for (const match of matches) {
    if (match.eventId && match.rawHtml) {
      byId.set(match.eventId, match.rawHtml);
    }
  }

  return byId;
}

async function fetchSeasonEvents(competition: CompetitionRow) {
  const sourceUrl = buildWikipediaUrl(competition.slug);
  const response = await fetchWithPolicy(sourceUrl);
  const parsedMatches = parsePremiershipLiveHtml(await response.text());

  return {
    sourceUrl,
    veventById: buildVeventById(parsedMatches),
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const competitions = await loadCompetitions(options.season);
  const matches = await loadTargetMatches(competitions);

  const matchesByCompetition = new Map<string, MatchRow[]>();
  for (const match of matches) {
    const group = matchesByCompetition.get(match.competition_id) ?? [];
    group.push(match);
    matchesByCompetition.set(match.competition_id, group);
  }

  console.log(
    `Target finished Premiership matches without events: ${matches.length}`,
  );

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

    let seasonEvents: Awaited<ReturnType<typeof fetchSeasonEvents>>;
    try {
      seasonEvents = await fetchSeasonEvents(competition);
    } catch (error) {
      console.warn(
        `Unable to fetch Premiership season page for ${competition.slug}:`,
        error,
      );
      continue;
    }

    for (const match of competitionMatches) {
      const homeTeamName = match.home_team?.name ?? "Unknown";
      const awayTeamName = match.away_team?.name ?? "Unknown";
      const eventId = getWikipediaEventId(match.external_ids);

      if (!eventId) {
        console.warn(
          `No wikipedia_event_id for ${competition.season} ${homeTeamName} v ${awayTeamName} (${match.id})`,
        );
        continue;
      }

      const rawHtml = seasonEvents.veventById.get(eventId);

      if (!rawHtml) {
        console.warn(
          `No vevent found for ${competition.season} ${homeTeamName} v ${awayTeamName} (${eventId})`,
        );
        continue;
      }

      try {
        const events = parseMatchEventsFromVeventHtml(rawHtml);
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
          `Unable to backfill events for ${competition.season} ${homeTeamName} v ${awayTeamName}:`,
          error,
        );
      }
    }
  }

  console.log(
    `Backfill Premiership match events complete: target_matches=${matches.length} events_found=${eventsFound} events_inserted=${eventsInserted} dry_run=${options.dryRun}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
