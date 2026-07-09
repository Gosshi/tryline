/**
 * Backfill Top 14 regular-season match basics from the official LNR calendar.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-top14-regular-season.ts --season=2025-26 --dry-run
 *   pnpm tsx scripts/backfill-top14-regular-season.ts --season=2025-26 --confirm-owner-approved
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatches } from "@/lib/ingestion/upsert";
import {
  fetchTop14LnrRegularSeasonResults,
  type Top14LnrMatchResult,
} from "@/lib/scrapers/top14-lnr-results";

import type { Database, Json } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  ownerApproved: boolean;
  season: string;
};

type TeamLookup = Record<string, string>;

type RunDeps = {
  db: SupabaseClient<Database>;
  fetchResults?: typeof fetchTop14LnrRegularSeasonResults;
  logger?: Pick<Console, "error" | "log">;
  options: CliOptions;
};

type BackfillResult = {
  dryRun: boolean;
  matchesInserted: number;
  matchesUpdated: number;
  parsed: number;
  season: string;
};

const FAMILY = "top-14";
const USAGE =
  "Usage: pnpm tsx scripts/backfill-top14-regular-season.ts --season=<YYYY-YY> [--dry-run] [--confirm-owner-approved]";

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let ownerApproved = false;
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

  if (!season || !/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(USAGE);
  }

  if (!dryRun && !ownerApproved) {
    throw new Error(`${USAGE}\nWrites require --confirm-owner-approved.`);
  }

  return { dryRun, ownerApproved, season };
}

function getCompetitionDates(results: Top14LnrMatchResult[]) {
  const dates = results
    .map((result) => result.kickoff_at.slice(0, 10))
    .sort((a, b) => a.localeCompare(b));
  const startDate = dates[0];
  const endDate = dates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Unable to derive Top 14 regular-season dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(
  db: SupabaseClient<Database>,
  season: string,
  results: Top14LnrMatchResult[],
) {
  const { endDate, startDate } = getCompetitionDates(results);
  const { data, error } = await db
    .from("competitions")
    .upsert(
      {
        end_date: endDate,
        family: FAMILY,
        name: `Top 14 ${season}`,
        season,
        slug: `${FAMILY}-${season}`,
        start_date: startDate,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function getTeamLookup(
  db: SupabaseClient<Database>,
  teamSlugs: string[],
): Promise<TeamLookup> {
  const uniqueSlugs = [...new Set(teamSlugs)].sort();
  const { data, error } = await db
    .from("teams")
    .select("id, slug")
    .in("slug", uniqueSlugs);

  if (error) {
    throw error;
  }

  const lookup = Object.fromEntries(
    (data ?? []).map((team) => [team.slug, team.id]),
  );
  const missing = uniqueSlugs.filter((slug) => !lookup[slug]);

  if (missing.length > 0) {
    throw new Error(`Unknown Top 14 team slug(s): ${missing.join(", ")}`);
  }

  return lookup;
}

function buildExternalIds(result: Top14LnrMatchResult): Record<string, Json> {
  return {
    source: "top14-lnr",
    top14_lnr_id: result.lnr_id,
    top14_lnr_match_path: result.lnr_match_path,
    top14_lnr_round_slug: result.round_slug,
    top14_lnr_url: result.source_url,
    wikipedia_round: result.round,
  };
}

function resolveCandidates(params: {
  competitionId: string;
  results: Top14LnrMatchResult[];
  teamLookup: TeamLookup;
}) {
  return params.results.map((result) => {
    const homeTeamId = params.teamLookup[result.home_team_slug];
    const awayTeamId = params.teamLookup[result.away_team_slug];

    if (!homeTeamId || !awayTeamId) {
      throw new Error(
        `Unable to resolve Top 14 teams: ${result.home_team_slug} vs ${result.away_team_slug}`,
      );
    }

    return {
      awayScore: result.away_score,
      awayTeamId,
      competitionId: params.competitionId,
      externalIds: buildExternalIds(result),
      homeScore: result.home_score,
      homeTeamId,
      kickoffAt: result.kickoff_at,
      status: result.status,
      venue: result.venue,
    };
  });
}

async function upsertCompetitionTeams(
  db: SupabaseClient<Database>,
  competitionId: string,
  teamLookup: TeamLookup,
) {
  const rows = Object.values(teamLookup).map((teamId) => ({
    competition_id: competitionId,
    team_id: teamId,
  }));
  const { error } = await db
    .from("competition_teams")
    .upsert(rows, { onConflict: "competition_id,team_id" });

  if (error) {
    throw error;
  }
}

export async function runBackfillTop14RegularSeason({
  db,
  fetchResults = fetchTop14LnrRegularSeasonResults,
  logger = console,
  options,
}: RunDeps): Promise<BackfillResult> {
  const results = await fetchResults(options.season);
  const uniqueTeams = [
    ...new Set(
      results.flatMap((result) => [
        result.home_team_slug,
        result.away_team_slug,
      ]),
    ),
  ].sort();

  logger.log(
    `Top 14 regular-season target: season=${options.season} parsed=${results.length} teams=${uniqueTeams.length} dry_run=${options.dryRun}`,
  );

  if (options.dryRun) {
    return {
      dryRun: true,
      matchesInserted: 0,
      matchesUpdated: 0,
      parsed: results.length,
      season: options.season,
    };
  }

  if (results.length === 0) {
    throw new Error(
      `No Top 14 regular-season matches parsed for ${options.season}`,
    );
  }

  const competitionId = await upsertCompetition(db, options.season, results);
  const teamLookup = await getTeamLookup(db, uniqueTeams);
  const candidates = resolveCandidates({ competitionId, results, teamLookup });
  const upserted = await upsertMatches(candidates);
  await upsertCompetitionTeams(db, competitionId, teamLookup);

  const result = {
    dryRun: false,
    matchesInserted: upserted.matchesInserted,
    matchesUpdated: upserted.matchesUpdated,
    parsed: results.length,
    season: options.season,
  };

  logger.log(
    `Top 14 regular-season backfill complete: season=${options.season} parsed=${result.parsed} inserted=${result.matchesInserted} updated=${result.matchesUpdated}`,
  );

  return result;
}

if (process.argv[1]?.endsWith("backfill-top14-regular-season.ts")) {
  const options = parseOptions(process.argv.slice(2));

  runBackfillTop14RegularSeason({
    db: options.dryRun
      ? ({} as SupabaseClient<Database>)
      : getSupabaseServerClient(),
    options,
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
