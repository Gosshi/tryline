import { getSupabaseServerClient } from "@/lib/db/server";
import { mapWikipediaTeamName } from "@/lib/scrapers/wikipedia-team-name-map";
import { scrapeWorldRugbyRankings } from "@/lib/scrapers/wikipedia-world-rankings";

import type { ParsedRankingRow } from "@/lib/scrapers/wikipedia-world-rankings";

type RankingTeamRow = {
  english_name: string | null;
  id: string;
  name: string;
  slug: string;
};

export type TeamWorldRankingLookup = Record<string, string>;

export type WorldRankingIngestionResult = {
  parsed: number;
  unmatched: string[];
  updated: number;
};

function comparisonKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function buildWorldRankingTeamLookup(
  rows: ParsedRankingRow[],
  teams: RankingTeamRow[],
): TeamWorldRankingLookup {
  const teamByAlias = new Map<string, string>();

  for (const team of teams) {
    const aliases = [team.name, team.english_name, team.slug.replace(/-/g, " ")]
      .filter((value): value is string => Boolean(value));

    for (const alias of aliases) {
      teamByAlias.set(comparisonKey(alias), team.id);
    }
  }

  return Object.fromEntries(
    rows.flatMap((row) => {
      const rawKey = comparisonKey(row.teamName);
      const mappedKey = comparisonKey(mapWikipediaTeamName(row.teamName));
      const teamId = teamByAlias.get(rawKey) ?? teamByAlias.get(mappedKey);

      return teamId ? [[row.teamName, teamId]] : [];
    }),
  );
}

export async function loadRankingTeams(): Promise<RankingTeamRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("teams")
    .select("id, name, english_name, slug");

  if (error) {
    throw error;
  }

  return (data ?? []) as RankingTeamRow[];
}

export async function upsertTeamWorldRankings(params: {
  rows: ParsedRankingRow[];
  teamLookup: TeamWorldRankingLookup;
  updatedAt?: string;
}): Promise<{ unmatched: string[]; updated: number }> {
  const client = getSupabaseServerClient();
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  let updated = 0;
  const unmatched: string[] = [];

  for (const row of params.rows) {
    const teamId = params.teamLookup[row.teamName];

    if (!teamId) {
      console.warn(`Skipping World Rugby ranking for unmatched team: ${row.teamName}`);
      unmatched.push(row.teamName);
      continue;
    }

    const { error } = await client
      .from("teams")
      .update({
        world_ranking: row.rank,
        world_ranking_updated_at: updatedAt,
      })
      .eq("id", teamId);

    if (error) {
      throw error;
    }

    updated += 1;
  }

  return { unmatched, updated };
}

export async function ingestWorldRugbyRankings(): Promise<WorldRankingIngestionResult> {
  const rows = await scrapeWorldRugbyRankings();
  const teams = await loadRankingTeams();
  const teamLookup = buildWorldRankingTeamLookup(rows, teams);
  const { unmatched, updated } = await upsertTeamWorldRankings({
    rows,
    teamLookup,
  });

  return {
    parsed: rows.length,
    unmatched,
    updated,
  };
}
