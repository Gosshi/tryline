import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type CompetitionRow = {
  id: string;
  slug: string;
  family: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

type CompetitionDbRow = {
  id: string;
  slug: string;
  family: string;
  name: string;
  season: string;
  start_date: string | null;
  end_date: string | null;
};

function mapCompetitionRow(row: CompetitionDbRow): CompetitionRow {
  return {
    endDate: row.end_date,
    family: row.family,
    id: row.id,
    name: row.name,
    season: row.season,
    slug: row.slug,
    startDate: row.start_date,
  };
}

export async function listSeasonsByFamily(
  family: string,
): Promise<CompetitionRow[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id, slug, family, name, season, start_date, end_date")
    .eq("family", family)
    .order("season", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as CompetitionDbRow[]).map(mapCompetitionRow);
}

export async function getCompetitionBySlug(
  slug: string,
): Promise<CompetitionRow | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id, slug, family, name, season, start_date, end_date")
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
