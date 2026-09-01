/**
 * Backfill Top 14 regular-season match basics from the official LNR calendar.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-top14-regular-season.ts --season=2025-26 --dry-run
 *   pnpm tsx scripts/backfill-top14-regular-season.ts --season=2025-26 --confirm-owner-approved
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { TOP14_LNR_SEASON } from "@/lib/ingestion/sources/top14-lnr-live";
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
  finished: number;
  matchesInserted: number;
  matchesUpdated: number;
  parsed: number;
  scheduled: number;
  season: string;
};

const FAMILY = "top-14";
const LEGACY_SUPPORTED_SEASONS = ["2024-25", "2025-26"];
const SUPPORTED_SEASONS = [...LEGACY_SUPPORTED_SEASONS, TOP14_LNR_SEASON];
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

  if (!SUPPORTED_SEASONS.includes(season)) {
    throw new Error(
      `Unsupported Top 14 regular-season --season=${season}. Supported seasons: ${[
        ...SUPPORTED_SEASONS,
      ].join(", ")}`,
    );
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

export function mergeCompetitionDateRange(
  existing: { endDate: string | null; startDate: string | null },
  next: { endDate: string; startDate: string },
) {
  const isDate = (value: string | null): value is string => Boolean(value);
  const startDate = [existing.startDate, next.startDate]
    .filter(isDate)
    .sort((a, b) => a.localeCompare(b))[0];
  const endDate = [existing.endDate, next.endDate]
    .filter(isDate)
    .sort((a, b) => b.localeCompare(a))[0];

  if (!startDate || !endDate) {
    throw new Error("Unable to merge Top 14 competition dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(
  db: SupabaseClient<Database>,
  season: string,
  results: Top14LnrMatchResult[],
) {
  const { endDate, startDate } = getCompetitionDates(results);
  const slug = `${FAMILY}-${season}`;
  const { data: existing, error: existingError } = await db
    .from("competitions")
    .select("start_date, end_date")
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const mergedDates = mergeCompetitionDateRange(
    {
      endDate: existing?.end_date ?? null,
      startDate: existing?.start_date ?? null,
    },
    { endDate, startDate },
  );
  const { data, error } = await db
    .from("competitions")
    .upsert(
      {
        end_date: mergedDates.endDate,
        family: FAMILY,
        name: `Top 14 ${season}`,
        season,
        slug,
        start_date: mergedDates.startDate,
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

function summarizeResults(results: Top14LnrMatchResult[]) {
  const finished = results.filter(
    (result) => result.status === "finished",
  ).length;

  return {
    finished,
    scheduled: results.length - finished,
  };
}

function formatResultSample(result: Top14LnrMatchResult) {
  const score =
    result.status === "finished" &&
    result.home_score !== null &&
    result.away_score !== null
      ? `${result.home_score}-${result.away_score}`
      : "scheduled";

  return [
    `${result.home_team_slug} vs ${result.away_team_slug}`,
    `kickoff=${result.kickoff_at}`,
    `venue=${result.venue ?? "unknown"}`,
    `score=${score}`,
  ].join(" ");
}

function logDryRunSummary(
  logger: Pick<Console, "log">,
  results: Top14LnrMatchResult[],
) {
  const summary = summarizeResults(results);

  logger.log(
    `Top 14 regular-season status: finished=${summary.finished} scheduled=${summary.scheduled}`,
  );

  results.slice(0, 5).forEach((result, index) => {
    logger.log(
      `Top 14 regular-season sample ${index + 1}: ${formatResultSample(result)}`,
    );
  });

  return summary;
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
  const summary = logDryRunSummary(logger, results);

  if (options.dryRun) {
    return {
      dryRun: true,
      finished: summary.finished,
      matchesInserted: 0,
      matchesUpdated: 0,
      parsed: results.length,
      scheduled: summary.scheduled,
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
    finished: summary.finished,
    matchesInserted: upserted.matchesInserted,
    matchesUpdated: upserted.matchesUpdated,
    parsed: results.length,
    scheduled: summary.scheduled,
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
