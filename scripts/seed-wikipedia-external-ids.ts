/**
 * Seed matches.external_ids with Wikipedia season page references.
 *
 * Usage:
 *   pnpm tsx scripts/seed-wikipedia-external-ids.ts [--family=premiership] [--dry-run]
 */

import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseWikipediaRcSeasonMatches } from "@/lib/scrapers/wikipedia-rc-season-parser";
import {
  parseWikipediaSeasonMatches,
  type WikipediaSeasonMatch,
} from "@/lib/scrapers/wikipedia-season-parser";
import { mapWikipediaTeamName } from "@/lib/scrapers/wikipedia-team-name-map";
import { parseWikipediaUrcSeasonMatches } from "@/lib/scrapers/wikipedia-urc-season-parser";

import type { Json } from "@/lib/db/types";

type WikipediaSeasonFamily =
  | "premiership"
  | "rugby-championship"
  | "top-14"
  | "urc";

type CliOptions = {
  dryRun: boolean;
  family: WikipediaSeasonFamily | null;
};

type WikipediaSeasonTarget = {
  competitionSlug: string;
  family: WikipediaSeasonFamily;
  url: string;
};

type MatchRow = {
  away_team: { name: string } | null;
  external_ids: Json;
  home_team: { name: string } | null;
  id: string;
  kickoff_at: string;
};

type MatchUpdate = {
  id: string;
  nextExternalIds: Record<string, unknown>;
  row: MatchRow;
  source: WikipediaSeasonMatch;
};

const WIKIPEDIA_SEASON_URLS: Record<string, WikipediaSeasonTarget> = {
  "premiership-2025-26": {
    competitionSlug: "premiership-2025-26",
    family: "premiership",
    url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_Premiership_Rugby",
  },
  "rugby-championship-2025": {
    competitionSlug: "rugby-championship-2025",
    family: "rugby-championship",
    url: "https://en.wikipedia.org/wiki/2025_Rugby_Championship",
  },
  "top-14-2025-26": {
    competitionSlug: "top-14-2025-26",
    family: "top-14",
    url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_Top_14",
  },
  "urc-2025-26": {
    competitionSlug: "urc-2025-26",
    family: "urc",
    url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
  },
};

const USAGE =
  "Usage: pnpm tsx scripts/seed-wikipedia-external-ids.ts [--family=premiership] [--dry-run]";

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = false;
  let family: CliOptions["family"] = null;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--family=")) {
      const value = arg.slice("--family=".length);

      if (
        value !== "premiership" &&
        value !== "rugby-championship" &&
        value !== "top-14" &&
        value !== "urc"
      ) {
        throw new Error(`Unsupported --family value: ${value}`);
      }

      family = value;
      continue;
    }

    throw new Error(USAGE);
  }

  return { dryRun, family };
}

function asJsonObject(value: Json): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
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

function buildExternalIds(
  existing: Json,
  source: WikipediaSeasonMatch,
  seasonUrl: string,
): Record<string, unknown> {
  const next = asJsonObject(existing);

  delete next.wikipedia_event_id;
  next.wikipedia_url = seasonUrl;

  if (source.sectionId) {
    next.wikipedia_event_id = source.sectionId;
  }

  return next;
}

export function matchWikipediaEntryToMatch(
  source: WikipediaSeasonMatch,
  rows: MatchRow[],
  seasonUrl: string,
): MatchUpdate | null {
  const candidates = rows.filter((row) => {
    if (!row.home_team || !row.away_team) {
      return false;
    }

    return (
      wikiTeamMatchesDbTeam(source.homeTeamName, row.home_team.name) &&
      wikiTeamMatchesDbTeam(source.awayTeamName, row.away_team.name) &&
      sameMatchDate(source.dateKey, row.kickoff_at)
    );
  });

  if (candidates.length !== 1) {
    return null;
  }

  const [row] = candidates;

  return {
    id: row!.id,
    nextExternalIds: buildExternalIds(row!.external_ids, source, seasonUrl),
    row: row!,
    source,
  };
}

function getTargets(options: CliOptions): WikipediaSeasonTarget[] {
  const targets = Object.values(WIKIPEDIA_SEASON_URLS);

  return options.family
    ? targets.filter((target) => target.family === options.family)
    : targets;
}

async function loadFinishedMatches(competitionSlug: string): Promise<MatchRow[]> {
  const db = getSupabaseServerClient();
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
    .eq("status", "finished")
    .eq("competition.slug", competitionSlug)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as MatchRow[];
}

async function seedTarget(target: WikipediaSeasonTarget, dryRun: boolean) {
  const response = await fetchWithPolicy(target.url);
  const html = await response.text();
  const sourceMatches =
    target.family === "rugby-championship"
      ? parseWikipediaRcSeasonMatches(html)
      : target.family === "urc"
        ? parseWikipediaUrcSeasonMatches(html)
        : parseWikipediaSeasonMatches(html);
  const rows = await loadFinishedMatches(target.competitionSlug);
  const matched: MatchUpdate[] = [];
  let skipped = 0;

  for (const source of sourceMatches) {
    const update = matchWikipediaEntryToMatch(source, rows, target.url);

    if (!update) {
      skipped += 1;
      console.warn(
        `[skip] ${target.competitionSlug}: ${source.homeTeamName} v ${source.awayTeamName} ${source.dateKey ?? "unknown-date"}`,
      );
      continue;
    }

    matched.push(update);
  }

  console.log(
    `Matched ${matched.length} matches for ${target.competitionSlug} (source=${sourceMatches.length}, db=${rows.length}, skipped=${skipped}, dry_run=${dryRun})`,
  );

  for (const update of matched) {
    const label = `${update.row.home_team?.name ?? "Unknown"} v ${update.row.away_team?.name ?? "Unknown"} ${update.source.dateKey ?? "unknown-date"}`;

    if (dryRun) {
      console.log(
        `[dry-run] ${label}: wikipedia_event_id=${update.source.sectionId ?? "null"}`,
      );
      continue;
    }

    const db = getSupabaseServerClient();
    const { error } = await db
      .from("matches")
      .update({ external_ids: update.nextExternalIds as Json })
      .eq("id", update.id);

    if (error) {
      throw error;
    }

    console.log(`[ok] ${label}: external_ids updated`);
  }

  return matched.length;
}

export async function main() {
  const options = parseOptions(process.argv.slice(2));
  const targets = getTargets(options);
  let totalMatched = 0;

  for (const target of targets) {
    totalMatched += await seedTarget(target, options.dryRun);
  }

  console.log(
    `Wikipedia external_ids seed complete: matched=${totalMatched} dry_run=${options.dryRun}`,
  );
}

if (process.argv[1]?.endsWith("seed-wikipedia-external-ids.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
