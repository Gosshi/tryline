import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { formatCompetitionTitle } from "@/lib/format/competition";

export type PublishedMatchContent = {
  contentType: "preview" | "recap";
  contentMdJa: string;
  generatedAt: string;
  modelVersion: string;
  promptVersion: string;
};

export type PublishedMatchContentBundle = {
  preview: PublishedMatchContent | null;
  recap: PublishedMatchContent | null;
};

export type MatchContentStatus = {
  hasPreview: boolean;
  hasRecap: boolean;
};

export type PublishedRecapFeedItem = {
  awayTeamName: string;
  competitionName: string;
  contentMdJa: string;
  generatedAt: string;
  homeTeamName: string;
  matchId: string;
};

type PublishedMatchContentRow = {
  content_type: string;
  content_md: string;
  generated_at: string;
  model_version: string;
  prompt_version: string;
};

type MatchContentStatusRow = {
  match_id: string;
  content_type: string;
};

type PublishedRecapFeedRow = {
  content_md: string;
  generated_at: string;
  match_id: string;
  match: {
    away_team: { name: string; name_ja?: string | null } | null;
    competition: {
      family?: string | null;
      name: string;
      name_ja?: string | null;
      season: string;
      slug?: string | null;
    } | null;
    home_team: { name: string; name_ja?: string | null } | null;
  } | null;
};

function mapRow(row: PublishedMatchContentRow): PublishedMatchContent {
  if (row.content_type !== "preview" && row.content_type !== "recap") {
    throw new Error(`Unsupported content_type: ${row.content_type}`);
  }

  return {
    contentMdJa: row.content_md,
    contentType: row.content_type,
    generatedAt: row.generated_at,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
  };
}

export async function getPublishedContentForMatch(
  matchId: string,
): Promise<PublishedMatchContentBundle> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      "content_type, content_md, generated_at, model_version, prompt_version",
    )
    .eq("match_id", matchId)
    .eq("status", "published")
    .eq("language", "ja")
    .in("content_type", ["preview", "recap"]);

  if (error) {
    throw error;
  }

  const bundle: PublishedMatchContentBundle = {
    preview: null,
    recap: null,
  };

  for (const row of data satisfies PublishedMatchContentRow[]) {
    const mapped = mapRow(row);
    bundle[mapped.contentType] = mapped;
  }

  return bundle;
}

export async function getContentStatusMap(
  matchIds: string[],
): Promise<Map<string, MatchContentStatus>> {
  if (matchIds.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select("match_id, content_type")
    .in("match_id", matchIds)
    .eq("status", "published")
    .eq("language", "ja")
    .in("content_type", ["preview", "recap"]);

  if (error) {
    throw error;
  }

  const map = new Map<string, MatchContentStatus>();

  for (const row of data satisfies MatchContentStatusRow[]) {
    const current = map.get(row.match_id) ?? {
      hasPreview: false,
      hasRecap: false,
    };

    if (row.content_type === "preview") {
      current.hasPreview = true;
    }

    if (row.content_type === "recap") {
      current.hasRecap = true;
    }

    map.set(row.match_id, current);
  }

  return map;
}

export async function getContentStatusForMatches(
  matchIds: string[],
): Promise<Record<string, MatchContentStatus>> {
  const statusMap = await getContentStatusMap(matchIds);

  return Object.fromEntries(statusMap);
}

export async function listPublishedRecapsForFeed(
  limit = 30,
): Promise<PublishedRecapFeedItem[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        match_id,
        content_md,
        generated_at,
        match:matches!match_content_match_id_fkey (
          home_team:teams!matches_home_team_id_fkey (
            name,
            name_ja
          ),
          away_team:teams!matches_away_team_id_fkey (
            name,
            name_ja
          ),
          competition:competitions!matches_competition_id_fkey (
            family,
            name,
            name_ja,
            season,
            slug
          )
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("status", "published")
    .eq("language", "ja")
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as PublishedRecapFeedRow[])
    .filter(
      (row) =>
        row.match?.home_team && row.match.away_team && row.match.competition,
    )
    .map((row) => ({
      awayTeamName:
        row.match?.away_team?.name_ja ?? row.match?.away_team?.name ?? "",
      competitionName: row.match?.competition
        ? formatCompetitionTitle(
            {
              family: row.match.competition.family,
              name: row.match.competition.name,
              nameJa: row.match.competition.name_ja,
              slug: row.match.competition.slug,
            },
            row.match.competition.season,
          )
        : "",
      contentMdJa: row.content_md,
      generatedAt: row.generated_at,
      homeTeamName:
        row.match?.home_team?.name_ja ?? row.match?.home_team?.name ?? "",
      matchId: row.match_id,
    }));
}
