import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { scrapeWikipediaRwcMatchEvents } from "@/lib/scrapers/wikipedia-rwc-match-events";

import type { Json } from "@/lib/db/types";

type CliOptions = {
  dryRun: boolean;
  force: boolean;
  limit: number;
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
  competition: { family: string; season: string; slug: string } | null;
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
  "Usage: pnpm tsx scripts/backfill-rwc-match-events.ts [--season <YYYY>] [--force] [--dry-run] [--limit=N]";

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let force = false;
  let limit = 100;
  let season: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--force") {
      force = true;
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

    if (arg === "--limit") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10);

      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --limit value: ${argv[index + 1] ?? ""}`);
      }

      limit = parsed;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);

      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --limit value: ${arg.slice("--limit=".length)}`);
      }

      limit = parsed;
      continue;
    }

    throw new Error(USAGE);
  }

  if (season !== null && !/^\d{4}$/.test(season)) {
    throw new Error(`Invalid --season value: ${season}`);
  }

  return { dryRun, force, limit, season };
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

async function loadCompetitions(season: string | null) {
  const db = getSupabaseServerClient();
  let query = db
    .from("competitions")
    .select("id, season, slug")
    .eq("family", "rwc")
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
  options: CliOptions,
): Promise<MatchRow[]> {
  if (competitions.length === 0) {
    return [];
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
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
    .in(
      "competition_id",
      competitions.map((competition) => competition.id),
    )
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as MatchRow[])
    .filter((match) => {
      if (!match.competition || !getWikipediaSource(match.external_ids)) {
        return false;
      }

      if (options.force) {
        return true;
      }

      return match.match_events.length === 0;
    })
    .slice(0, options.limit);
}

export async function main() {
  const options = parseOptions(process.argv.slice(2));
  const competitions = await loadCompetitions(options.season);
  const matches = await loadTargetMatches(competitions, options);
  let eventsInserted = 0;
  let skipped = 0;

  console.log(
    `Found ${matches.length} ${options.season ? `rwc-${options.season}` : "rwc"} matches with ${options.force ? "events targetable for forced refresh" : "missing events"}`,
  );

  for (const match of matches) {
    const source = getWikipediaSource(match.external_ids);
    const label = `${match.competition?.slug ?? "unknown"} ${match.home_team?.name ?? "Unknown"} v ${match.away_team?.name ?? "Unknown"}`;

    if (!source) {
      skipped += 1;
      console.warn(`[skip] ${label}: missing Wikipedia source`);
      continue;
    }

    const details = await scrapeWikipediaRwcMatchEvents(source);

    if (options.dryRun) {
      console.log(`[dry-run] ${label}: events=${details.events.length}`);
      continue;
    }

    const result = await upsertMatchEvents({
      awayTeamId: match.away_team_id,
      events: details.events,
      homeTeamId: match.home_team_id,
      matchId: match.id,
    });

    if (details.events.length === 0) {
      skipped += 1;
    }

    eventsInserted += result.inserted;
    console.log(`[ok] ${label}: events=${result.inserted}`);
  }

  console.log(
    `Backfill complete: matches=${matches.length} events_inserted=${eventsInserted} skipped=${skipped} dry_run=${options.dryRun}`,
  );
}

if (process.argv[1]?.endsWith("backfill-rwc-match-events.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
