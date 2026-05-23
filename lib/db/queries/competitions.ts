import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type CompetitionRow = {
  champion: string | null;
  id: string;
  slug: string;
  family: string;
  matchCount: number;
  publishedContentCount: number;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

export type HomepageCompetitionLink = {
  endDate: string | null;
  family: string;
  name: string;
  season: string;
};

type CompetitionDbRow = {
  champion: string | null;
  id: string;
  slug: string;
  family: string;
  matches: Array<{ count: number | null }> | null;
  name: string;
  season: string;
  start_date: string | null;
  end_date: string | null;
};

type MatchContentCompetitionRow = {
  matches: { competition_id: string } | Array<{ competition_id: string }> | null;
};

function mapCompetitionRow(row: CompetitionDbRow): CompetitionRow {
  return {
    champion: row.champion,
    endDate: row.end_date,
    family: row.family,
    id: row.id,
    matchCount: row.matches?.[0]?.count ?? 0,
    name: row.name,
    publishedContentCount: 0,
    season: row.season,
    slug: row.slug,
    startDate: row.start_date,
  };
}

export function selectLatestSeasonWithMatches(
  seasons: CompetitionRow[],
): CompetitionRow | null {
  const withContent = seasons.filter(
    (season) => season.publishedContentCount > 0,
  );

  if (withContent.length > 0) {
    return withContent[0] ?? null;
  }

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
      .select(
        "id, slug, family, name, season, champion, start_date, end_date, matches(count)",
      )
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

  const countByCompetitionId = new Map<string, number>();

  for (const row of
    (contentCountsResult.data ?? []) as MatchContentCompetitionRow[]) {
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

  return ((seasonsResult.data ?? []) as CompetitionDbRow[]).map((row) => ({
    ...mapCompetitionRow(row),
    publishedContentCount: countByCompetitionId.get(row.id) ?? 0,
  }));
}

export async function getCompetitionBySlug(
  slug: string,
): Promise<CompetitionRow | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select(
      "id, slug, family, name, season, champion, start_date, end_date, matches(count)",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapCompetitionRow(data as CompetitionDbRow) : null;
}

export async function listFamilies(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client.from("competitions").select("family");

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.family))].sort();
}