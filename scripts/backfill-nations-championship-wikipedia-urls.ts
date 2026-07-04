/**
 * Backfill matches.external_ids.wikipedia_url for Nations Championship 2026
 * and Six Nations 2027.
 *
 * Dry-run is the default:
 *   node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-wikipedia-urls.ts
 *
 * Apply only after Owner approval:
 *   node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-wikipedia-urls.ts --confirm-owner-approved
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { WIKIPEDIA_SIX_NATIONS_2027_URL } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";

import type { Json } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const NATIONS_CHAMPIONSHIP_2026_SLUG =
  "nations-championship-2026";
export const SIX_NATIONS_2027_SLUG = "six-nations-2027";
export const NATIONS_CHAMPIONSHIP_SOUTHERN_URL =
  "https://en.wikipedia.org/wiki/2026_Nations_Championship_Southern_Hemisphere_Series";
export const NATIONS_CHAMPIONSHIP_NORTHERN_URL =
  "https://en.wikipedia.org/wiki/2026_Nations_Championship_Northern_Hemisphere_Series";

type CliOptions = {
  dryRun: boolean;
};

type JsonObject = Record<string, unknown>;

export type TargetMatchRow = {
  away_team?: { name: string } | null;
  competition?: { slug: string } | null;
  external_ids: Json;
  home_team?: { name: string } | null;
  id: string;
  kickoff_at: string;
};

export type WikipediaUrlUpdate = {
  awayTeamName: string | null;
  competitionSlug: string;
  from: string | null;
  homeTeamName: string | null;
  matchId: string;
  nextExternalIds: JsonObject;
  round: string | null;
  to: string;
};

type SkippedMatch = {
  competitionSlug: string | null;
  matchId: string;
  reason: "unsupported_competition" | "unsupported_round";
  round: string | null;
};

const TARGET_COMPETITION_SLUGS = [
  NATIONS_CHAMPIONSHIP_2026_SLUG,
  SIX_NATIONS_2027_SLUG,
] as const;

const USAGE =
  "Usage: node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-wikipedia-urls.ts [--confirm-owner-approved]";

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = true;

  for (const arg of argv) {
    if (arg === "--confirm-owner-approved") {
      dryRun = false;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(USAGE);
  }

  return { dryRun };
}

function asJsonObject(value: Json): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function getWikipediaRound(externalIds: Json): string | null {
  const ids = asJsonObject(externalIds);

  return getStringValue(ids.wikipedia_round);
}

export function getNationsChampionshipWikipediaUrl(
  externalIds: Json,
): string | null {
  const round = getWikipediaRound(externalIds);

  if (round === "1" || round === "2" || round === "3") {
    return NATIONS_CHAMPIONSHIP_SOUTHERN_URL;
  }

  if (round === "4" || round === "5" || round === "6") {
    return NATIONS_CHAMPIONSHIP_NORTHERN_URL;
  }

  return null;
}

export function getTargetWikipediaUrl(row: TargetMatchRow): string | null {
  const competitionSlug = row.competition?.slug ?? null;

  if (competitionSlug === NATIONS_CHAMPIONSHIP_2026_SLUG) {
    return getNationsChampionshipWikipediaUrl(row.external_ids);
  }

  if (competitionSlug === SIX_NATIONS_2027_SLUG) {
    return WIKIPEDIA_SIX_NATIONS_2027_URL;
  }

  return null;
}

export function mergeWikipediaUrl(
  externalIds: Json,
  wikipediaUrl: string,
): JsonObject {
  return {
    ...asJsonObject(externalIds),
    wikipedia_url: wikipediaUrl,
  };
}

function getExistingWikipediaUrl(externalIds: Json): string | null {
  return getStringValue(asJsonObject(externalIds).wikipedia_url);
}

export function buildWikipediaUrlUpdates(rows: TargetMatchRow[]): {
  skipped: SkippedMatch[];
  updates: WikipediaUrlUpdate[];
} {
  const skipped: SkippedMatch[] = [];
  const updates: WikipediaUrlUpdate[] = [];

  for (const row of rows) {
    const competitionSlug = row.competition?.slug ?? null;
    const to = getTargetWikipediaUrl(row);
    const round = getWikipediaRound(row.external_ids);

    if (!to) {
      skipped.push({
        competitionSlug,
        matchId: row.id,
        reason:
          competitionSlug === NATIONS_CHAMPIONSHIP_2026_SLUG
            ? "unsupported_round"
            : "unsupported_competition",
        round,
      });
      continue;
    }

    updates.push({
      awayTeamName: row.away_team?.name ?? null,
      competitionSlug: competitionSlug ?? "",
      from: getExistingWikipediaUrl(row.external_ids),
      homeTeamName: row.home_team?.name ?? null,
      matchId: row.id,
      nextExternalIds: mergeWikipediaUrl(row.external_ids, to),
      round,
      to,
    });
  }

  return { skipped, updates };
}

async function loadTargetMatches(
  db: SupabaseClient,
): Promise<TargetMatchRow[]> {
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        external_ids,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        competition:competitions!matches_competition_id_fkey!inner(slug)
      `,
    )
    .in("competition.slug", [...TARGET_COMPETITION_SLUGS])
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as TargetMatchRow[];
}

async function applyUpdates(
  db: SupabaseClient,
  updates: WikipediaUrlUpdate[],
): Promise<void> {
  for (const update of updates) {
    const { error } = await db
      .from("matches")
      .update({ external_ids: update.nextExternalIds })
      .eq("id", update.matchId);

    if (error) {
      throw error;
    }
  }
}

export async function runBackfillWikipediaUrls(
  options: CliOptions,
  db: SupabaseClient = getSupabaseServerClient(),
) {
  const rows = await loadTargetMatches(db);
  const { skipped, updates } = buildWikipediaUrlUpdates(rows);

  if (!options.dryRun) {
    await applyUpdates(db, updates);
  }

  const byCompetition = updates.reduce<Record<string, number>>(
    (accumulator, update) => {
      accumulator[update.competitionSlug] =
        (accumulator[update.competitionSlug] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  return {
    applied: !options.dryRun,
    byCompetition,
    skipped,
    targetMatches: rows.length,
    updates,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await runBackfillWikipediaUrls(options);

  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1]?.endsWith(
    "backfill-nations-championship-wikipedia-urls.ts",
  )
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
