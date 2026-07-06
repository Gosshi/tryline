/**
 * Backfill Top 14 team statistics from the official LNR match stats pages.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-top14-team-stats.ts --dry-run [--season=2025-26]
 *   pnpm tsx scripts/backfill-top14-team-stats.ts --confirm-owner-approved [--season=2025-26]
 */

import { load } from "cheerio";

import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import {
  buildTop14MatchStatsUrl,
  fetchTop14MatchStats,
  type Top14TeamStats,
} from "@/lib/scrapers/top14-match-stats";

import type { Database, Json } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  ownerApproved: boolean;
  season: string | null;
};

type CompetitionRow = {
  id: string;
  season: string;
  slug: string;
};

type MatchRow = {
  away_team: { name: string; slug: string } | null;
  away_team_id: string;
  competition_id: string;
  external_ids: Json;
  home_team: { name: string; slug: string } | null;
  home_team_id: string;
  id: string;
  kickoff_at: string;
};

export type Top14CalendarMatchLink = {
  awaySlug: string;
  id: string;
  homeSlug: string;
  matchPath: string;
  roundSlug: string;
  season: string;
  statsUrl: string;
};

type RunBackfillDeps = {
  db: SupabaseClient<Database>;
  fetchCalendarHtml?: (url: string) => Promise<string>;
  fetchStats?: typeof fetchTop14MatchStats;
  logger?: Pick<Console, "error" | "log" | "warn">;
  options: CliOptions;
};

type BackfillResult = {
  dryRun: boolean;
  fetched: number;
  resolvedLnrIds: number;
  skipped: number;
  targetMatches: number;
  upsertedRows: number;
};

type MatchExternalIds = Record<string, unknown> & {
  top14_lnr_id?: unknown;
  wikipedia_round?: unknown;
  round_number?: unknown;
  round_name?: unknown;
};

const TOP14_ORIGIN = "https://top14.lnr.fr";
const USAGE =
  "Usage: pnpm tsx scripts/backfill-top14-team-stats.ts --dry-run [--season=2025-26] or --confirm-owner-approved";
const LNR_TEAM_SLUG_ALIASES: Record<string, string[]> = {
  bayonne: ["aviron-bayonnais"],
  "bordeaux-begles": ["union-bordeaux-begles"],
  clermont: ["asm-clermont-auvergne"],
  lyon: ["lyon-ou"],
  paris: ["stade-francais-paris", "stade-francais"],
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSlug(value: string) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function toExternalIds(value: Json): MatchExternalIds {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as MatchExternalIds;
}

function getTop14LnrId(externalIds: Json): string | null {
  const value = toExternalIds(externalIds).top14_lnr_id;

  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }

  return typeof value === "string" && /^\d+$/.test(value) ? value : null;
}

function getRoundNumber(externalIds: Json): number | null {
  const ids = toExternalIds(externalIds);
  const value = ids.wikipedia_round ?? ids.round_number;

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  const roundName = typeof ids.round_name === "string" ? ids.round_name : "";
  const match = roundName.match(/\b(?:round|j)\s*(\d{1,2})\b/i);

  return match ? Number(match[1]) : null;
}

export function getRoundSlug(externalIds: Json): string | null {
  const roundNumber = getRoundNumber(externalIds);

  if (roundNumber !== null) {
    return `j${roundNumber}`;
  }

  const roundName = toExternalIds(externalIds).round_name;

  if (typeof roundName !== "string") {
    return null;
  }

  const normalized = normalizeText(roundName);

  if (normalized.includes("final") && !normalized.includes("semi")) {
    return "finale";
  }

  if (normalized.includes("semi") || normalized.includes("demi")) {
    return "demi-finales";
  }

  if (normalized.includes("barrage") || normalized.includes("quarter")) {
    return "barrages";
  }

  return null;
}

export function toLnrSeason(season: string) {
  const short = season.match(/^(\d{4})-(\d{2})$/);

  if (short) {
    return `${short[1]}-20${short[2]}`;
  }

  return season;
}

export function buildTop14CalendarUrl(season: string, roundSlug: string) {
  return `${TOP14_ORIGIN}/calendrier-et-resultats/${toLnrSeason(season)}/${roundSlug}`;
}

export function parseTop14CalendarMatchLinks(
  html: string,
): Top14CalendarMatchLink[] {
  const $ = load(html);
  const links = new Map<string, Top14CalendarMatchLink>();

  $("a[href*='/feuille-de-match/']").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    const url = new URL(href, TOP14_ORIGIN);
    const match = url.pathname.match(
      /^\/feuille-de-match\/([^/]+)\/([^/]+)\/(\d+)-(.+)$/,
    );

    if (!match) {
      return;
    }

    const [, season, roundSlug, id, slugPart] = match;
    const parts = slugPart!.split("-");
    const splitIndex = Math.max(1, parts.length - 1);
    const homeSlug = parts.slice(0, splitIndex).join("-");
    const awaySlug = parts.slice(splitIndex).join("-");
    const matchPath = url.pathname;

    links.set(id!, {
      awaySlug,
      homeSlug,
      id: id!,
      matchPath,
      roundSlug: roundSlug!,
      season: season!,
      statsUrl: buildTop14MatchStatsUrl(matchPath),
    });
  });

  return [...links.values()];
}

function teamMatchesLnrSlug(
  team: { name: string; slug: string } | null,
  lnrSlug: string,
) {
  if (!team) {
    return false;
  }

  const teamSlug = normalizeSlug(team.slug);
  const teamName = normalizeSlug(team.name);
  const lnr = normalizeSlug(lnrSlug);
  const aliases = LNR_TEAM_SLUG_ALIASES[lnr] ?? [];

  return (
    teamSlug === lnr ||
    teamName === lnr ||
    aliases.includes(teamSlug) ||
    aliases.includes(teamName) ||
    teamSlug.includes(lnr) ||
    teamName.includes(lnr) ||
    lnr.includes(teamSlug) ||
    lnr.includes(teamName)
  );
}

export function findTop14CalendarMatch(
  row: MatchRow,
  links: Top14CalendarMatchLink[],
): Top14CalendarMatchLink | null {
  const existingId = getTop14LnrId(row.external_ids);
  const byId = existingId
    ? links.find((link) => link.id === existingId)
    : undefined;

  if (byId) {
    return byId;
  }

  const candidates = links.filter(
    (link) =>
      teamMatchesLnrSlug(row.home_team, link.homeSlug) &&
      teamMatchesLnrSlug(row.away_team, link.awaySlug),
  );

  return candidates.length === 1 ? candidates[0]! : null;
}

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
      season = arg.slice("--season=".length) || null;
      continue;
    }

    throw new Error(USAGE);
  }

  if (!dryRun && !ownerApproved) {
    throw new Error(`${USAGE}\nWrites require --confirm-owner-approved.`);
  }

  if (season !== null && !/^\d{4}-(?:\d{2}|\d{4})$/.test(season)) {
    throw new Error(`Invalid --season value: ${season}`);
  }

  return { dryRun, ownerApproved, season };
}

async function loadCompetitions(
  db: SupabaseClient<Database>,
  season: string | null,
) {
  let query = db
    .from("competitions")
    .select("id, season, slug")
    .eq("family", "top-14")
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
  db: SupabaseClient<Database>,
  competitions: CompetitionRow[],
) {
  if (competitions.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        competition_id,
        external_ids,
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey(name, slug),
        away_team:teams!matches_away_team_id_fkey(name, slug)
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

  return (data ?? []) as MatchRow[];
}

function toInsertRow(args: {
  matchId: string;
  sourceUrl: string;
  stats: Top14TeamStats;
  teamId: string;
}) {
  return {
    carries: args.stats.carries ?? null,
    errors: args.stats.errors ?? null,
    lineouts_total: args.stats.lineouts_total ?? null,
    lineouts_won: args.stats.lineouts_won ?? null,
    match_id: args.matchId,
    penalties_conceded: args.stats.penalties_conceded ?? null,
    possession_pct: args.stats.possession_pct ?? null,
    red_cards: args.stats.red_cards ?? null,
    scrums_total: args.stats.scrums_total ?? null,
    scrums_won: args.stats.scrums_won ?? null,
    source: "top14-lnr",
    source_url: args.sourceUrl,
    tackles_made: args.stats.tackles_made ?? null,
    tackles_missed: args.stats.tackles_missed ?? null,
    team_id: args.teamId,
    territory_pct: args.stats.territory_pct ?? null,
    yellow_cards: args.stats.yellow_cards ?? null,
  };
}

async function upsertMatchTeamStats(
  db: SupabaseClient<Database>,
  row: MatchRow,
  stats: {
    away: Top14TeamStats;
    home: Top14TeamStats;
    sourceUrl: string;
  },
) {
  const rows = [
    toInsertRow({
      matchId: row.id,
      sourceUrl: stats.sourceUrl,
      stats: stats.home,
      teamId: row.home_team_id,
    }),
    toInsertRow({
      matchId: row.id,
      sourceUrl: stats.sourceUrl,
      stats: stats.away,
      teamId: row.away_team_id,
    }),
  ];
  const { error } = await db
    .from("match_team_stats")
    .upsert(rows, { onConflict: "match_id,team_id" });

  if (error) {
    throw error;
  }
}

async function mergeTop14LnrId(
  db: SupabaseClient<Database>,
  row: MatchRow,
  lnrId: string,
) {
  const currentExternalIds =
    row.external_ids && typeof row.external_ids === "object"
      ? (row.external_ids as Record<string, Json>)
      : {};
  const externalIds: Json = {
    ...currentExternalIds,
    top14_lnr_id: lnrId,
  };
  const { error } = await db
    .from("matches")
    .update({ external_ids: externalIds })
    .eq("id", row.id);

  if (error) {
    throw error;
  }
}

export async function runBackfillTop14TeamStats({
  db,
  fetchCalendarHtml = async (url: string) => {
    const response = await fetchWithPolicy(url);
    return response.text();
  },
  fetchStats = fetchTop14MatchStats,
  logger = console,
  options,
}: RunBackfillDeps): Promise<BackfillResult> {
  const competitions = await loadCompetitions(db, options.season);
  const matches = await loadTargetMatches(db, competitions);
  const competitionById = new Map(
    competitions.map((competition) => [competition.id, competition]),
  );
  const calendarCache = new Map<string, Top14CalendarMatchLink[]>();
  let fetched = 0;
  let resolvedLnrIds = 0;
  let skipped = 0;
  let upsertedRows = 0;

  logger.log(`Target finished Top 14 matches: ${matches.length}`);

  for (const match of matches) {
    const competition = competitionById.get(match.competition_id);
    const roundSlug = getRoundSlug(match.external_ids);

    if (!competition || !roundSlug) {
      skipped += 1;
      logger.warn(`Skipping ${match.id}: unable to derive LNR round slug.`);
      continue;
    }

    const calendarUrl = buildTop14CalendarUrl(competition.season, roundSlug);
    let calendarLinks = calendarCache.get(calendarUrl);

    if (!calendarLinks) {
      const html = await fetchCalendarHtml(calendarUrl);
      calendarLinks = parseTop14CalendarMatchLinks(html);
      calendarCache.set(calendarUrl, calendarLinks);
    }

    const calendarMatch = findTop14CalendarMatch(match, calendarLinks);

    if (!calendarMatch) {
      skipped += 1;
      logger.warn(`Skipping ${match.id}: unable to resolve Top 14 LNR id.`);
      continue;
    }

    if (!getTop14LnrId(match.external_ids)) {
      resolvedLnrIds += 1;

      if (!options.dryRun) {
        await mergeTop14LnrId(db, match, calendarMatch.id);
      }
    }

    const stats = await fetchStats(calendarMatch.matchPath);

    if (!stats) {
      skipped += 1;
      logger.warn(`Skipping ${match.id}: no team stats found.`);
      continue;
    }

    fetched += 1;

    if (!options.dryRun) {
      await upsertMatchTeamStats(db, match, stats);
      upsertedRows += 2;
    }

    logger.log(
      `${options.dryRun ? "[dry-run] " : ""}${match.id}: ${calendarMatch.id} ${stats.sourceUrl}`,
    );
  }

  const result = {
    dryRun: options.dryRun,
    fetched,
    resolvedLnrIds,
    skipped,
    targetMatches: matches.length,
    upsertedRows,
  };

  logger.log(JSON.stringify(result));
  return result;
}

if (process.argv[1]?.endsWith("backfill-top14-team-stats.ts")) {
  const options = parseOptions(process.argv.slice(2));

  runBackfillTop14TeamStats({
    db: getSupabaseServerClient(),
    options,
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
