import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { type MatchStatus } from "@/lib/format/status";
import { truncateAtSentenceBoundary } from "@/lib/text";

import type { Json } from "@/lib/db/types";

export type MatchListItem = {
  id: string;
  kickoffAt: string;
  status: MatchStatus;
  homeTeam: { slug: string; name: string; shortCode: string };
  awayTeam: { slug: string; name: string; shortCode: string };
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: number | null;
};

export type MatchDetail = MatchListItem & {
  competition: { family: string; slug: string; name: string; season: string };
  awayTeamId: string;
  homeTeamId: string;
};

export type CompetitionSummary = {
  slug: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

export type RecentlyReviewedMatch = MatchListItem & {
  competition: { slug: string; name: string; season: string };
  recapGeneratedAt: string;
  recapExcerpt: string;
};

export type UpcomingMatch = MatchListItem & {
  competition: { slug: string; name: string; season: string };
};

export type FavoriteTeamMatch = UpcomingMatch;

export type TeamPageMatch = MatchListItem & {
  competition: { slug: string; name: string; season: string };
};

export type LatestCompletedMatch = {
  id: string;
};

export type SitemapMatch = {
  competitionFamily: string | null;
  id: string;
};

export type EnglishMatchContent = {
  contentMdJa: string;
  contentType: "preview" | "recap";
  generatedAt: string;
  modelVersion: string;
  promptVersion: string;
};

export type EnglishMatchContentBundle = {
  preview: EnglishMatchContent | null;
  recap: EnglishMatchContent | null;
};

type BaseMatchRow = {
  id: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  external_ids: Json;
  home_team: {
    slug: string;
    name: string;
    short_code: string | null;
  } | null;
  away_team: {
    slug: string;
    name: string;
    short_code: string | null;
  } | null;
};

type MatchDetailRow = BaseMatchRow & {
  home_team_id: string;
  away_team_id: string;
  competition: {
    family?: string;
    slug: string;
    name: string;
    season: string;
  } | null;
};

type LatestCompetitionRow = {
  competition: {
    slug: string;
    name: string;
    season: string;
    start_date: string | null;
    end_date: string | null;
  } | null;
};

type RecentlyReviewedMatchRow = BaseMatchRow & {
  competition: {
    family?: string;
    slug: string;
    name: string;
    season: string;
  } | null;
};

type RecentlyReviewedContentRow = {
  content_md_ja: string;
  generated_at: string;
  match: RecentlyReviewedMatchRow | null;
};

type UpcomingMatchRow = BaseMatchRow & {
  competition: {
    family?: string;
    slug: string;
    name: string;
    season: string;
  } | null;
};

type TeamPageMatchRow = BaseMatchRow & {
  competition: {
    slug: string;
    name: string;
    season: string;
  } | null;
};

type EnglishMatchContentRow = {
  content_type: string;
  content_md_ja: string;
  generated_at: string;
  model_version: string;
  prompt_version: string;
};

type SitemapMatchRow = {
  id: string;
  competition: {
    family: string | null;
    slug: string;
  } | null;
};

function isMatchStatus(value: string): value is MatchStatus {
  return [
    "scheduled",
    "in_progress",
    "finished",
    "postponed",
    "cancelled",
  ].includes(value);
}

function getRoundFromExternalIds(externalIds: Json): number | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const round = externalIds.round ?? externalIds.wikipedia_round;

  return typeof round === "number" ? round : null;
}

function mapMatchRow(row: BaseMatchRow): MatchListItem {
  if (!row.home_team || !row.away_team) {
    throw new Error(`Match ${row.id} is missing team relations.`);
  }

  if (!isMatchStatus(row.status)) {
    throw new Error(`Match ${row.id} has an unsupported status: ${row.status}`);
  }

  return {
    awayScore: row.away_score,
    awayTeam: {
      name: row.away_team.name,
      shortCode:
        row.away_team.short_code ??
        row.away_team.name.slice(0, 3).toUpperCase(),
      slug: row.away_team.slug,
    },
    homeScore: row.home_score,
    homeTeam: {
      name: row.home_team.name,
      shortCode:
        row.home_team.short_code ??
        row.home_team.name.slice(0, 3).toUpperCase(),
      slug: row.home_team.slug,
    },
    id: row.id,
    kickoffAt: row.kickoff_at,
    round: getRoundFromExternalIds(row.external_ids),
    status: row.status,
    venue: row.venue,
  };
}

function mapEnglishContentRow(
  row: EnglishMatchContentRow,
): EnglishMatchContent {
  if (row.content_type !== "preview" && row.content_type !== "recap") {
    throw new Error(`Unsupported content_type: ${row.content_type}`);
  }

  return {
    contentMdJa: row.content_md_ja,
    contentType: row.content_type,
    generatedAt: row.generated_at,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
  };
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getCompetitionBySlug(competitionSlug: string) {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getLatestCompetitionWithMatches(): Promise<CompetitionSummary | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        kickoff_at,
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season,
          start_date,
          end_date
        )
      `,
    )
    .eq("status", "finished")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.competition) {
    return null;
  }

  const { competition } = data satisfies LatestCompetitionRow;

  if (!competition) {
    return null;
  }

  return {
    endDate: competition.end_date,
    name: competition.name,
    season: competition.season,
    slug: competition.slug,
    startDate: competition.start_date,
  };
}

export async function getRecentlyReviewedMatches(
  limit = 3,
): Promise<RecentlyReviewedMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        generated_at,
        content_md_ja,
        match:matches!match_content_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          venue,
          external_ids,
          home_team:teams!matches_home_team_id_fkey (
            slug,
            name,
            short_code
          ),
          away_team:teams!matches_away_team_id_fkey (
            slug,
            name,
            short_code
          ),
          competition:competitions!matches_competition_id_fkey (
            slug,
            name,
            season
          )
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("language", "ja")
    .eq("status", "published")
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data satisfies RecentlyReviewedContentRow[])
    .filter((row) => row.match !== null)
    .map((row) => {
      if (!row.match?.competition) {
        throw new Error("Recently reviewed match is missing competition.");
      }

      return {
        ...mapMatchRow(row.match),
        competition: row.match.competition,
        recapGeneratedAt: row.generated_at,
        recapExcerpt: truncateAtSentenceBoundary(
          stripMarkdown(row.content_md_ja),
          120,
        ),
      };
    });
}

export async function getLatestCompletedMatch(): Promise<LatestCompletedMatch | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select("id")
    .eq("status", "finished")
    .lt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? { id: data.id } : null;
}

export async function getRecentlyReviewedMatchesForFamily(
  family: string,
  limit = 3,
): Promise<MatchListItem[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        match:matches!match_content_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          venue,
          external_ids,
          home_team:teams!matches_home_team_id_fkey (
            slug,
            name,
            short_code
          ),
          away_team:teams!matches_away_team_id_fkey (
            slug,
            name,
            short_code
          ),
          competition:competitions!matches_competition_id_fkey (
            family,
            slug,
            name,
            season
          )
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("language", "ja")
    .eq("status", "published")
    .order("generated_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data satisfies Array<{ match: RecentlyReviewedMatchRow | null }>)
    .filter((row) => row.match?.competition?.family === family)
    .slice(0, limit)
    .map((row) => {
      if (!row.match) {
        throw new Error("Recently reviewed family match is missing match.");
      }

      return mapMatchRow(row.match);
    });
}

export async function getUpcomingMatches(limit = 5): Promise<UpcomingMatch[]> {
  const client = getSupabasePublicServerClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        ),
        competition:competitions!matches_competition_id_fkey (
          family,
          slug,
          name,
          season
        )
      `,
    )
    .eq("status", "scheduled")
    .gte("kickoff_at", now)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data satisfies UpcomingMatchRow[])
    .filter((row) => row.competition !== null)
    .map((row) => {
      if (!row.competition) {
        throw new Error("Upcoming match is missing competition.");
      }

      return {
        ...mapMatchRow(row),
        competition: row.competition,
      };
    });
}

export async function getFavoriteTeamMatches(
  teamSlugs: string[],
  limit = 5,
): Promise<FavoriteTeamMatch[]> {
  if (teamSlugs.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const now = new Date().toISOString();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        ),
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season
        )
      `,
    )
    .or(
      `and(status.eq.scheduled,kickoff_at.gte.${now}),and(status.eq.finished,kickoff_at.gte.${sevenDaysAgo})`,
    )
    .order("kickoff_at", { ascending: true })
    .limit(50);

  if (error) {
    throw error;
  }

  const filtered = (data satisfies UpcomingMatchRow[]).filter(
    (row) =>
      row.competition !== null &&
      (teamSlugs.includes(row.home_team?.slug ?? "") ||
        teamSlugs.includes(row.away_team?.slug ?? "")),
  );

  return filtered.slice(0, limit).map((row) => {
    if (!row.competition) {
      throw new Error("Favorite team match is missing competition.");
    }

    return {
      ...mapMatchRow(row),
      competition: row.competition,
    };
  });
}

export async function listAllMatchIds(): Promise<SitemapMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        competition:competitions!matches_competition_id_fkey (
          family,
          slug
        )
      `,
    )
    .order("kickoff_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data satisfies SitemapMatchRow[]).map((row) => ({
    competitionFamily:
      row.competition?.family ??
      row.competition?.slug.replace(/-\d{4}(-\d{2})?$/, "") ??
      null,
    id: row.id,
  }));
}

export async function getMatchContentEn(
  matchId: string,
): Promise<EnglishMatchContentBundle> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      "content_type, content_md_ja, generated_at, model_version, prompt_version",
    )
    .eq("match_id", matchId)
    .eq("language", "en")
    .eq("status", "published")
    .in("content_type", ["preview", "recap"]);

  if (error) {
    throw error;
  }

  const bundle: EnglishMatchContentBundle = {
    preview: null,
    recap: null,
  };

  for (const row of data satisfies EnglishMatchContentRow[]) {
    const mapped = mapEnglishContentRow(row);
    bundle[mapped.contentType] = mapped;
  }

  return bundle;
}

export async function getTeamBySlug(
  teamSlug: string,
): Promise<{ slug: string; name: string; shortCode: string } | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("slug, name, short_code")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    name: data.name,
    shortCode: data.short_code ?? data.name.slice(0, 3).toUpperCase(),
    slug: data.slug,
  };
}

export async function getMatchesByTeamSlug(
  teamSlug: string,
  limit = 30,
): Promise<{ past: TeamPageMatch[]; upcoming: TeamPageMatch[] }> {
  const client = getSupabasePublicServerClient();
  const { data: teamRow, error: teamError } = await client
    .from("teams")
    .select("id")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (teamError) {
    throw teamError;
  }

  if (!teamRow) {
    return { past: [], upcoming: [] };
  }

  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        ),
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season
        )
      `,
    )
    .or(`home_team_id.eq.${teamRow.id},away_team_id.eq.${teamRow.id}`)
    .order("kickoff_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const now = new Date().toISOString();
  const rows = (data satisfies TeamPageMatchRow[])
    .filter((row) => row.competition !== null)
    .map((row) => {
      if (!row.competition) {
        throw new Error("Team page match is missing competition.");
      }

      return {
        ...mapMatchRow(row),
        competition: row.competition,
      };
    });

  return {
    past: rows.filter((match) => match.status === "finished"),
    upcoming: rows
      .filter((match) => match.kickoffAt >= now)
      .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt)),
  };
}

export async function listMatchesForCompetition(
  competitionSlug: string,
): Promise<MatchListItem[]> {
  const competition = await getCompetitionBySlug(competitionSlug);

  if (!competition) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        )
      `,
    )
    .eq("competition_id", competition.id)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data satisfies BaseMatchRow[]).map(mapMatchRow);
}

export async function getMatchById(
  matchId: string,
): Promise<MatchDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_team_id,
        away_team_id,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          short_code
        ),
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season
        )
      `,
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const match = mapMatchRow(data satisfies MatchDetailRow);

  if (!data.competition) {
    throw new Error(`Match ${matchId} is missing competition relation.`);
  }

  const competition = data.competition as MatchDetailRow["competition"];

  return {
    ...match,
    awayTeamId: data.away_team_id,
    competition: {
      family:
        competition?.family ??
        competition!.slug.replace(/-\d{4}(-\d{2})?$/, ""),
      name: competition!.name,
      season: competition!.season,
      slug: competition!.slug,
    },
    homeTeamId: data.home_team_id,
  };
}
