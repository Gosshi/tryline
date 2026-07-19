/**
 * Backfill Japanese national-team players' kanji names from JRFU roster articles.
 *
 * Dry-run is the default:
 *   pnpm tsx scripts/backfill-japan-player-kanji-names.ts --dry-run
 *
 * Apply only after Owner approval:
 *   pnpm tsx scripts/backfill-japan-player-kanji-names.ts --confirm-owner-approved
 */

import { load } from "cheerio";

import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchWithPolicy } from "@/lib/scrapers";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const USAGE =
  "Usage: pnpm tsx scripts/backfill-japan-player-kanji-names.ts [--dry-run|--confirm-owner-approved]";

export const JAPAN_ROSTER_SOURCE_URLS = [
  "https://www.rugby-japan.jp/news/54051",
  "https://www.rugby-japan.jp/news/54068",
] as const;

export type BackfillOptions = {
  dryRun: boolean;
};

export type JapanPlayerRow = {
  id: string;
  name: string;
  name_ja: string | null;
};

export type PlayerKanjiNameCandidate = {
  englishName: string;
  japaneseName: string;
  sourceUrl: string;
};

export type PlayerKanjiNameUpdate = PlayerKanjiNameCandidate & {
  playerId: string;
};

export function parseOptions(argv: string[]): BackfillOptions {
  let dryRun = true;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      dryRun = false;
      continue;
    }

    throw new Error(USAGE);
  }

  return { dryRun };
}

function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function containsKanji(value: string) {
  return /[\p{Script=Han}]/u.test(value);
}

function normalizeJapaneseName(value: string) {
  return value.replace(/[◎\s]+/g, " ").trim();
}

export function parseJapanRosterNameCandidates(
  html: string,
  sourceUrl: string,
): PlayerKanjiNameCandidate[] {
  const $ = load(html);
  const candidates: PlayerKanjiNameCandidate[] = [];

  $("table tr").each((_, row) => {
    const cells = $(row).find("td");
    const number = $(cells[0]).text().trim();
    const nameCellText = $(cells[1]).text().replace(/\s+/g, " ").trim();

    if (!/^\d{1,2}$/.test(number) || !nameCellText) {
      return;
    }

    const latinStart = nameCellText.search(/[A-Za-z]/);
    if (latinStart <= 0) {
      return;
    }

    const japaneseName = normalizeJapaneseName(
      nameCellText.slice(0, latinStart),
    );
    const englishName = nameCellText.slice(latinStart).trim();

    if (!containsKanji(japaneseName) || !normalizeName(englishName)) {
      return;
    }

    candidates.push({ englishName, japaneseName, sourceUrl });
  });

  return candidates;
}

export function buildPlayerKanjiNameUpdates(
  players: JapanPlayerRow[],
  candidates: PlayerKanjiNameCandidate[],
): PlayerKanjiNameUpdate[] {
  const candidatesByName = new Map(
    candidates.map((candidate) => [normalizeName(candidate.englishName), candidate]),
  );

  return players.flatMap((player) => {
    if (player.name_ja) {
      return [];
    }

    const candidate = candidatesByName.get(normalizeName(player.name));
    return candidate ? [{ ...candidate, playerId: player.id }] : [];
  });
}

async function loadJapanPlayers(
  db: SupabaseClient<Database>,
): Promise<JapanPlayerRow[]> {
  const { data, error } = await db
    .from("players")
    .select("id, name, name_ja, team:teams!players_team_id_fkey!inner(slug)")
    .eq("team.slug", "japan")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(({ id, name, name_ja }) => ({ id, name, name_ja }));
}

async function applyUpdates(
  db: SupabaseClient<Database>,
  updates: PlayerKanjiNameUpdate[],
): Promise<void> {
  for (const update of updates) {
    const { error } = await db
      .from("players")
      .update({ name_ja: update.japaneseName })
      .eq("id", update.playerId);

    if (error) {
      throw error;
    }
  }
}

export async function runBackfillJapanPlayerKanjiNames(
  options: BackfillOptions,
  dependencies: {
    db?: SupabaseClient<Database>;
    fetchArticleHtml?: (url: string) => Promise<string>;
  } = {},
) {
  const db = dependencies.db ?? getSupabaseServerClient();
  const fetchArticleHtml =
    dependencies.fetchArticleHtml ??
    (async (url: string) => (await fetchWithPolicy(url)).text());
  const players = await loadJapanPlayers(db);
  const candidates = (
    await Promise.all(
      JAPAN_ROSTER_SOURCE_URLS.map(async (sourceUrl) =>
        parseJapanRosterNameCandidates(await fetchArticleHtml(sourceUrl), sourceUrl),
      ),
    )
  ).flat();
  const updates = buildPlayerKanjiNameUpdates(players, candidates);

  if (!options.dryRun) {
    await applyUpdates(db, updates);
  }

  return {
    applied: !options.dryRun,
    candidates,
    japanPlayers: players.length,
    sourceUrls: [...JAPAN_ROSTER_SOURCE_URLS],
    updates,
  };
}

async function main() {
  const result = await runBackfillJapanPlayerKanjiNames(
    parseOptions(process.argv.slice(2)),
  );

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith("backfill-japan-player-kanji-names.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
