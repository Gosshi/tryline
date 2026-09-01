import { unstable_cache } from "next/cache";
import { cache } from "react";

import { PUBLIC_DATA_CACHE_TAGS } from "@/lib/cache/public-data";
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type CompetitionRow = {
  champion: string | null;
  id: string;
  slug: string;
  family: string;
  matchCount: number;
  publishedContentCount: number;
  name: string;
  nameJa?: string | null;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

export type HomepageCompetitionLink = {
  endDate: string | null;
  family: string;
  name: string;
  name_ja?: string | null;
  publishedContentCount?: number;
  season: string;
};

export type CompetitionGuide = {
  guideJa: string;
  sourceUrl: string | null;
  verifiedAt: string | null;
};

type CompetitionStartDateRow = {
  start_date: string | null;
};

type CompetitionDbRow = {
  champion: string | null;
  id: string;
  slug: string;
  family: string;
  matches: Array<{ count: number | null }> | null;
  name: string;
  name_ja?: string | null;
  season: string;
  start_date: string | null;
  end_date: string | null;
};

type MatchContentCompetitionRow = {
  matches: { competition_id: string } | Array<{ competition_id: string }> | null;
};

function countPublishedContentByCompetition(
  rows: MatchContentCompetitionRow[],
): Map<string, number> {
  const countByCompetitionId = new Map<string, number>();

  for (const row of rows) {
    const relation = row.matches;
    const matches = Array.isArray(relation)
      ? relation
      : relation
        ? [relation]
        : [];

    for (const match of matches) {
      countByCompetitionId.set(
        match.competition_id,
        (countByCompetitionId.get(match.competition_id) ?? 0) + 1,
      );
    }
  }

  return countByCompetitionId;
}

function withPublishedContentCounts(
  rows: CompetitionDbRow[],
  countByCompetitionId: Map<string, number>,
): CompetitionRow[] {
  return rows.map((row) => ({
    ...mapCompetitionRow(row),
    publishedContentCount: countByCompetitionId.get(row.id) ?? 0,
  }));
}

function mapCompetitionRow(row: CompetitionDbRow): CompetitionRow {
  return {
    champion: row.champion,
    endDate: row.end_date,
    family: row.family,
    id: row.id,
    matchCount: row.matches?.[0]?.count ?? 0,
    name: row.name,
    nameJa: row.name_ja ?? null,
    publishedContentCount: 0,
    season: row.season,
    slug: row.slug,
    startDate: row.start_date,
  };
}

export function selectLatestSeasonWithMatches(
  seasons: CompetitionRow[],
): CompetitionRow | null {
  const withMatches = seasons.filter((season) => season.matchCount > 0);

  return withMatches[0] ?? seasons[0] ?? null;
}

function isRecentlyActive(endDate: string | null, now = new Date()): boolean {
  if (!endDate) {
    return false;
  }

  const diffMs =
    now.getTime() - new Date(`${endDate}T23:59:59.999Z`).getTime();

  return diffMs <= 14 * 24 * 60 * 60 * 1000;
}

export function sortHomepageCompetitionLinks(
  links: HomepageCompetitionLink[],
  now = new Date(),
): HomepageCompetitionLink[] {
  return [...links].sort((left, right) => {
    const leftActive = isRecentlyActive(left.endDate, now);
    const rightActive = isRecentlyActive(right.endDate, now);

    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }

    return right.season.localeCompare(left.season);
  });
}

export async function listSeasonsByFamily(
  family: string,
): Promise<CompetitionRow[]> {
  const client = getSupabasePublicServerClient();
  const [seasonsResult, contentCountsResult] = await Promise.all([
    client
      .from("competitions")
      .select("*, matches(count)")
      .eq("family", family)
      .order("season", { ascending: false }),
    client
      .from("match_content")
      .select("matches!inner(competition_id)")
      .eq("status", "published"),
  ]);

  if (seasonsResult.error) {
    throw seasonsResult.error;
  }

  if (contentCountsResult.error) {
    throw contentCountsResult.error;
  }

  const countByCompetitionId = countPublishedContentByCompetition(
    (contentCountsResult.data ?? []) as MatchContentCompetitionRow[],
  );

  return withPublishedContentCounts(
    (seasonsResult.data ?? []) as CompetitionDbRow[],
    countByCompetitionId,
  );
}

export async function getCompetitionStartDateByFamilyAndSeason(
  family: string,
  season: string,
): Promise<string | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("start_date")
    .eq("family", family)
    .eq("season", season)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return ((data as CompetitionStartDateRow | null) ?? null)?.start_date ?? null;
}

export async function listSeasonsByFamilies(
  families: string[],
): Promise<Map<string, CompetitionRow[]>> {
  if (families.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const [seasonsResults, contentCountsResult] = await Promise.all([
    Promise.all(
      families.map((family) =>
        client
          .from("competitions")
          .select("*, matches(count)")
          .eq("family", family)
          .order("season", { ascending: false }),
      ),
    ),
    client
      .from("match_content")
      .select("matches!inner(competition_id)")
      .eq("status", "published"),
  ]);

  if (contentCountsResult.error) {
    throw contentCountsResult.error;
  }

  const countByCompetitionId = countPublishedContentByCompetition(
    (contentCountsResult.data ?? []) as MatchContentCompetitionRow[],
  );
  const seasonsByFamily = new Map<string, CompetitionRow[]>();

  for (const [index, result] of seasonsResults.entries()) {
    if (result.error) {
      throw result.error;
    }

    const family = families[index];

    if (!family) {
      continue;
    }

    seasonsByFamily.set(
      family,
      withPublishedContentCounts(
        (result.data ?? []) as CompetitionDbRow[],
        countByCompetitionId,
      ),
    );
  }

  return seasonsByFamily;
}

export async function getCompetitionBySlug(
  slug: string,
): Promise<CompetitionRow | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("*, matches(count)")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapCompetitionRow(data as CompetitionDbRow) : null;
}

async function loadCompetitionGuide(
  family: string,
): Promise<CompetitionGuide | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competition_guides")
    .select("guide_ja, source_url, verified_at")
    .eq("family", family)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? {
        guideJa: data.guide_ja,
        sourceUrl: data.source_url ?? null,
        verifiedAt: data.verified_at ?? null,
      }
    : null;
}

export const getCompetitionGuide = cache(
  unstable_cache(loadCompetitionGuide, ["public-data", "competition-guide"], {
    revalidate: 3600,
    tags: [PUBLIC_DATA_CACHE_TAGS.competitions],
  }),
);

async function loadFamilies(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client.from("competitions").select("family");

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.family))].sort();
}

export const listFamilies = cache(
  unstable_cache(loadFamilies, ["public-data", "competition-families"], {
    revalidate: 3600,
    tags: [PUBLIC_DATA_CACHE_TAGS.competitions],
  }),
);
