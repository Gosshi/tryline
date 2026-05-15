/**
 * Backfill club match scoring events and lineups from Wikipedia season pages.
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
import type { WikipediaMatchLineup } from "@/lib/scrapers/wikipedia-lineups";

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
  match_lineups: Array<{ id: string }>;
};

type PlayerRow = {
  id: string;
  name: string;
};

type LineupRow = {
  announced_at: string;
  jersey_number: number;
  match_id: string;
  player_id: string;
  source_url: string;
  team_id: string;
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
        match_events(id),
        match_lineups(id)
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

    return match.match_events.length === 0 || match.match_lineups.length === 0;
  });
}

async function ensurePlayerIds(
  teamId: string,
  names: string[],
): Promise<Map<string, string>> {
  const db = getSupabaseServerClient();
  const uniqueNames = [...new Set(names)];

  if (uniqueNames.length === 0) {
    return new Map();
  }

  const { data: existing, error: existingError } = await db
    .from("players")
    .select("id, name")
    .eq("team_id", teamId)
    .in("name", uniqueNames);

  if (existingError) {
    throw existingError;
  }

  const existingByName = new Map(
    ((existing ?? []) as PlayerRow[]).map((player) => [player.name, player.id]),
  );
  const missingNames = uniqueNames.filter((name) => !existingByName.has(name));

  if (missingNames.length > 0) {
    const { error: insertError } = await db.from("players").insert(
      missingNames.map((name) => ({
        external_ids: { wikipedia_title: name },
        name,
        team_id: teamId,
      })),
    );

    if (insertError) {
      throw insertError;
    }

    const { data: inserted, error: insertedError } = await db
      .from("players")
      .select("id, name")
      .eq("team_id", teamId)
      .in("name", missingNames);

    if (insertedError) {
      throw insertedError;
    }

    ((inserted ?? []) as PlayerRow[]).forEach((player) => {
      existingByName.set(player.name, player.id);
    });
  }

  return existingByName;
}

function buildLineupRows(params: {
  awayPlayerIds: Map<string, string>;
  homePlayerIds: Map<string, string>;
  lineup: WikipediaMatchLineup;
  match: MatchRow;
}): LineupRow[] {
  const homeRows = params.lineup.home_players.flatMap((player) => {
    const playerId = params.homePlayerIds.get(player.name);

    return playerId
      ? [
          {
            announced_at: params.lineup.announced_at,
            jersey_number: player.jersey_number,
            match_id: params.match.id,
            player_id: playerId,
            source_url: params.lineup.source_url,
            team_id: params.match.home_team_id,
          },
        ]
      : [];
  });
  const awayRows = params.lineup.away_players.flatMap((player) => {
    const playerId = params.awayPlayerIds.get(player.name);

    return playerId
      ? [
          {
            announced_at: params.lineup.announced_at,
            jersey_number: player.jersey_number,
            match_id: params.match.id,
            player_id: playerId,
            source_url: params.lineup.source_url,
            team_id: params.match.away_team_id,
          },
        ]
      : [];
  });

  return [...homeRows, ...awayRows];
}

async function upsertLineupRows(rows: LineupRow[]) {
  if (rows.length === 0) {
    return 0;
  }

  const db = getSupabaseServerClient();
  const { error } = await db
    .from("match_lineups")
    .upsert(rows, { onConflict: "match_id,team_id,jersey_number" });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function persistDetails(match: MatchRow, details: WikipediaClubMatchDetails) {
  let eventsInserted = 0;
  let lineupsInserted = 0;

  if (match.match_events.length === 0 && details.events.length > 0) {
    const upserted = await upsertMatchEvents({
      awayTeamId: match.away_team_id,
      events: details.events,
      homeTeamId: match.home_team_id,
      matchId: match.id,
    });
    eventsInserted = upserted.inserted;
  }

  if (match.match_lineups.length === 0 && details.lineup) {
    const homePlayerIds = await ensurePlayerIds(
      match.home_team_id,
      details.lineup.home_players.map((player) => player.name),
    );
    const awayPlayerIds = await ensurePlayerIds(
      match.away_team_id,
      details.lineup.away_players.map((player) => player.name),
    );

    lineupsInserted = await upsertLineupRows(
      buildLineupRows({
        awayPlayerIds,
        homePlayerIds,
        lineup: details.lineup,
        match,
      }),
    );
  }

  return { eventsInserted, lineupsInserted };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const matches = await loadTargetMatches(options);
  let eventsInserted = 0;
  let lineupsInserted = 0;
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
        `[dry-run] ${label}: events=${details.events.length} home_lineup=${details.lineup?.home_players.length ?? 0} away_lineup=${details.lineup?.away_players.length ?? 0}`,
      );
      continue;
    }

    const result = await persistDetails(match, details);

    if (result.eventsInserted === 0 && result.lineupsInserted === 0) {
      skipped += 1;
    }

    eventsInserted += result.eventsInserted;
    lineupsInserted += result.lineupsInserted;
    console.log(
      `[ok] ${label}: events=${result.eventsInserted} lineups=${result.lineupsInserted}`,
    );
  }

  console.log(
    `Backfill complete: matches=${matches.length} events=${eventsInserted} lineups=${lineupsInserted} skipped=${skipped} dry_run=${options.dryRun}`,
  );
}

if (process.argv[1]?.endsWith("backfill-club-match-details.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
