import { unstable_cache } from "next/cache";
import { cache } from "react";

import { PUBLIC_DATA_CACHE_TAGS } from "@/lib/cache/public-data";
import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import {
  getMatchBroadcastPresenceForMatches,
  getMatchBroadcastsForMatches,
  type MatchBroadcast,
} from "@/lib/db/queries/match-broadcasts";
import { getStandingPositionLookupForCompetitions } from "@/lib/db/queries/standings";
import { getCompetitionDisplayName } from "@/lib/format/competition";
import { getMatchLevelScore } from "@/lib/format/match-level";
import { type MatchStatus } from "@/lib/format/status";
import { getTeamDisplayName } from "@/lib/format/team";
import { truncateAtSentenceBoundary } from "@/lib/text";

import type { Json } from "@/lib/db/types";

export type MatchListItem = {
  id: string;
  broadcastJpUrl?: string | null;
  kickoffAt: string;
  updatedAt?: string;
  status: MatchStatus;
  homeTeam: {
    id?: string;
    flagCode?: string | null;
    slug: string;
    name: string;
    nameJa?: string | null;
    shortCode: string;
    worldRanking?: number | null;
  };
  awayTeam: {
    id?: string;
    flagCode?: string | null;
    slug: string;
    name: string;
    nameJa?: string | null;
    shortCode: string;
    worldRanking?: number | null;
  };
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  round: number | null;
  roundName: string | null;
  poolName: string | null;
};

export type MatchDetail = Omit<MatchListItem, "awayTeam" | "homeTeam"> & {
  broadcasts: MatchBroadcast[];
  competition: {
    id?: string;
    family: string;
    slug: string;
    name: string;
    nameJa?: string | null;
    season: string;
  };
  awayTeam: MatchListItem["awayTeam"] & { englishName: string | null };
  awayTeamId: string;
  homeTeam: MatchListItem["homeTeam"] & { englishName: string | null };
  homeTeamId: string;
};

export type CompetitionSummary = {
  slug: string;
  name: string;
  nameJa?: string | null;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

export type ReviewedFamily = {
  family: string;
  competitionName: string;
  competitionSeason: string;
  competitionSlug: string;
  latestReviewAt: string;
};

export type RecentlyReviewedMatch = MatchListItem & {
  competition: {
    id?: string;
    family: string;
    slug: string;
    name: string;
    nameJa?: string | null;
    season: string;
  };
  recapGeneratedAt: string;
  recapExcerpt: string;
};

export type RecentlyReviewedCompetitionGroup = {
  compact: RecentlyReviewedMatch[];
  competition: RecentlyReviewedMatch["competition"];
  hero: RecentlyReviewedMatch;
  latestReviewAt: string;
  poolName: string | null;
  round: number | null;
  roundName: string | null;
};

export type UpcomingMatch = MatchListItem & {
  competition: {
    id?: string;
    family: string;
    slug: string;
    name: string;
    nameJa?: string | null;
    season: string;
  };
};

export type CalendarMatch = UpcomingMatch & {
  hasBroadcasts: boolean;
  hasPreview: boolean;
  hasRecap: boolean;
};

export type FavoriteTeamMatch = UpcomingMatch;

export type TeamNextMatch = {
  match: UpcomingMatch;
  teamId: string;
};

export type TeamPageMatch = MatchListItem & {
  competition: {
    slug: string;
    name: string;
    nameJa?: string | null;
    season: string;
  };
};

export type HeadToHeadTeam = {
  slug: string;
  name: string;
  nameJa?: string | null;
  shortCode: string;
};

export type HeadToHeadMatch = MatchListItem & {
  competition: {
    slug: string;
    name: string;
    nameJa?: string | null;
    season: string;
  };
};

export type HeadToHeadPageData = {
  canonicalSlug: string;
  matches: HeadToHeadMatch[];
  teamA: HeadToHeadTeam;
  teamB: HeadToHeadTeam;
};

export type HeadToHeadPair = {
  matchCount: number;
  slug: string;
  teamA: HeadToHeadTeam;
  teamB: HeadToHeadTeam;
  updatedAt: string;
};

export type LatestCompletedMatch = {
  id: string;
};

export type SitemapMatch = {
  competitionFamily: string | null;
  id: string;
  updatedAt: string;
};

export type RoundHubParam = {
  competition: string;
  round: number;
  season: string;
  updatedAt: string;
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

export type PoolTeam = {
  name: string;
  slug: string;
  nameJa: string | null;
};

type BaseMatchRow = {
  id: string;
  broadcast_jp_url?: string | null;
  kickoff_at: string;
  updated_at?: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
  external_ids: Json;
  home_team: {
    id?: string;
    english_name?: string | null;
    flag_code?: string | null;
    slug: string;
    name: string;
    name_ja?: string | null;
    short_code: string | null;
    world_ranking?: number | null;
  } | null;
  away_team: {
    id?: string;
    english_name?: string | null;
    flag_code?: string | null;
    slug: string;
    name: string;
    name_ja?: string | null;
    short_code: string | null;
    world_ranking?: number | null;
  } | null;
};

type MatchDetailRow = BaseMatchRow & {
  home_team_id: string;
  away_team_id: string;
  competition: {
    family?: string;
    slug: string;
    name: string;
    name_ja?: string | null;
    season: string;
  } | null;
};

type LatestCompetitionRow = {
  competition: {
    slug: string;
    name: string;
    name_ja?: string | null;
    season: string;
    start_date: string | null;
    end_date: string | null;
  } | null;
};

type RecentlyReviewedMatchRow = BaseMatchRow & {
  competition: {
    id?: string;
    family: string;
    slug: string;
    name: string;
    name_ja?: string | null;
    season: string;
  } | null;
};

const RECENTLY_REVIEWED_CANDIDATE_LIMIT = 40;
const RECENTLY_REVIEWED_ACTIVE_WINDOW_DAYS = 7;
const RECENTLY_REVIEWED_GROUP_LIMIT = 4;
const RECENTLY_REVIEWED_COMPETITION_CAP = 12;

type RecentlyReviewedContentRow = {
  content_md: string;
  generated_at: string;
  match: RecentlyReviewedMatchRow | null;
};

type RecentlyReviewedEntry = {
  match: RecentlyReviewedMatch;
  row: RecentlyReviewedContentRow & { match: RecentlyReviewedMatchRow };
};

type RecentlyReviewedFamilyContentRow = {
  generated_at: string;
  match: {
    competition: {
      family: string;
      slug: string;
      name: string;
      name_ja?: string | null;
      season: string;
    } | null;
  } | null;
};

type UpcomingMatchRow = BaseMatchRow & {
  competition: {
    id?: string;
    family: string;
    slug: string;
    name: string;
    name_ja?: string | null;
    season: string;
  } | null;
};

type TeamPageMatchRow = BaseMatchRow & {
  competition: {
    slug: string;
    name: string;
    name_ja?: string | null;
    season: string;
  } | null;
};

type EnglishMatchContentRow = {
  content_type: string;
  content_md: string;
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

type SitemapContentMatchRow = {
  generated_at: string;
  match_id: string;
  match: {
    competition: {
      family: string | null;
      slug: string;
    } | null;
  } | null;
};

type MatchContentIdRow = {
  content_type: string;
  match_id: string;
};

type RoundHubQueryRow = {
  external_ids: Json;
  kickoff_at: string;
  competition: {
    family: string;
    season: string;
  } | null;
};

type HeadToHeadTeamRow = {
  id: string;
  name: string;
  name_ja?: string | null;
  short_code: string | null;
  slug: string;
};

type HeadToHeadMatchRow = BaseMatchRow & {
  competition: {
    name: string;
    name_ja?: string | null;
    season: string;
    slug: string;
  } | null;
};

type HeadToHeadPairQueryRow = {
  away_team: HeadToHeadTeamRow | null;
  home_team: HeadToHeadTeamRow | null;
  kickoff_at: string;
};

const RECENTLY_REVIEWED_MATCH_SELECT = `
  generated_at,
  content_md,
  match:matches!match_content_match_id_fkey (
    id,
    kickoff_at,
    status,
    home_score,
    away_score,
    venue,
    external_ids,
    home_team:teams!matches_home_team_id_fkey (
      id,
      slug,
      name,
      short_code,
      world_ranking
    ),
    away_team:teams!matches_away_team_id_fkey (
      id,
      slug,
      name,
      short_code,
      world_ranking
    ),
    competition:competitions!matches_competition_id_fkey (
      id,
      family,
      slug,
      name,
      name_ja,
      season
    )
  )
`;

function mapRecentlyReviewedContentRow(
  row: RecentlyReviewedContentRow,
): RecentlyReviewedMatch | null {
  if (!row.match) {
    return null;
  }

  if (!row.match.competition) {
    throw new Error("Recently reviewed match is missing competition.");
  }

  return {
    ...mapMatchRow(row.match),
    competition: mapCompetitionRow(row.match.competition),
    recapGeneratedAt: row.generated_at,
    recapExcerpt: truncateAtSentenceBoundary(
      stripMarkdown(row.content_md),
      350,
    ),
  };
}

function mapCompetitionRow<T extends { name: string; name_ja?: string | null }>(
  row: T,
): Omit<T, "name_ja"> & { nameJa: string | null } {
  const { name_ja, ...competition } = row;

  return {
    ...competition,
    nameJa: name_ja ?? null,
  };
}

function mapHeadToHeadTeam(row: HeadToHeadTeamRow): HeadToHeadTeam {
  const nameJa = row.name_ja ?? null;
  const displayName = getTeamDisplayName({
    name: row.name,
    nameJa,
    slug: row.slug,
  });

  return {
    name: displayName,
    nameJa,
    shortCode: row.short_code ?? displayName.slice(0, 3).toUpperCase(),
    slug: row.slug,
  };
}

function sortHeadToHeadTeamRows(
  teamA: HeadToHeadTeamRow,
  teamB: HeadToHeadTeamRow,
): [HeadToHeadTeamRow, HeadToHeadTeamRow] {
  return teamA.slug.localeCompare(teamB.slug) <= 0
    ? [teamA, teamB]
    : [teamB, teamA];
}

function isMatchStatus(value: string): value is MatchStatus {
  return [
    "scheduled",
    "in_progress",
    "finished",
    "postponed",
    "cancelled",
  ].includes(value);
}

export function getRoundFromExternalIds(externalIds: Json): number | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const round = externalIds.round ?? externalIds.wikipedia_round;

  if (typeof round === "number" && Number.isInteger(round)) {
    return round;
  }

  if (typeof round === "string" && /^\d+$/.test(round.trim())) {
    return Number.parseInt(round, 10);
  }

  return null;
}

function getRoundNameFromExternalIds(externalIds: Json): string | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const roundName = externalIds.round_name;

  return typeof roundName === "string" ? roundName : null;
}

function getPoolNameFromExternalIds(externalIds: Json): string | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const poolName = externalIds.pool_name;

  return typeof poolName === "string" ? poolName : null;
}

function mapMatchRow(row: BaseMatchRow): MatchListItem {
  if (!row.home_team || !row.away_team) {
    throw new Error(`Match ${row.id} is missing team relations.`);
  }

  if (!isMatchStatus(row.status)) {
    throw new Error(`Match ${row.id} has an unsupported status: ${row.status}`);
  }

  const homeNameJa = row.home_team.name_ja ?? null;
  const awayNameJa = row.away_team.name_ja ?? null;
  const homeDisplayName = getTeamDisplayName({
    name: row.home_team.name,
    nameJa: homeNameJa,
    slug: row.home_team.slug,
  });
  const awayDisplayName = getTeamDisplayName({
    name: row.away_team.name,
    nameJa: awayNameJa,
    slug: row.away_team.slug,
  });

  return {
    awayScore: row.away_score,
    awayTeam: {
      id: row.away_team.id,
      flagCode: row.away_team.flag_code ?? null,
      name: awayDisplayName,
      nameJa: awayNameJa,
      shortCode:
        row.away_team.short_code ?? awayDisplayName.slice(0, 3).toUpperCase(),
      slug: row.away_team.slug,
      worldRanking: row.away_team.world_ranking ?? null,
    },
    homeScore: row.home_score,
    homeTeam: {
      id: row.home_team.id,
      flagCode: row.home_team.flag_code ?? null,
      name: homeDisplayName,
      nameJa: homeNameJa,
      shortCode:
        row.home_team.short_code ?? homeDisplayName.slice(0, 3).toUpperCase(),
      slug: row.home_team.slug,
      worldRanking: row.home_team.world_ranking ?? null,
    },
    id: row.id,
    broadcastJpUrl: row.broadcast_jp_url ?? null,
    kickoffAt: row.kickoff_at,
    updatedAt: row.updated_at,
    poolName: getPoolNameFromExternalIds(row.external_ids),
    round: getRoundFromExternalIds(row.external_ids),
    roundName: getRoundNameFromExternalIds(row.external_ids),
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
    contentMdJa: row.content_md,
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

async function getHeadToHeadTeamBySlug(
  teamSlug: string,
): Promise<HeadToHeadTeamRow | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("id, slug, name, short_code")
    .eq("slug", teamSlug)
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
    nameJa: null,
    season: competition.season,
    slug: competition.slug,
    startDate: competition.start_date,
  };
}

function getRecentlyReviewedGroupKey(row: RecentlyReviewedMatchRow) {
  const competition = row.competition;

  if (!competition) {
    return null;
  }

  return [competition.family, competition.season].join("|");
}

function pickRecentlyReviewedHero(
  entries: RecentlyReviewedEntry[],
  standingPositions: Map<string, Map<string, number>>,
) {
  let bestEntry = entries[0] ?? null;
  let bestScore = bestEntry
    ? getMatchLevelScore(bestEntry.match, standingPositions)
    : null;

  for (const entry of entries.slice(1)) {
    const score = getMatchLevelScore(entry.match, standingPositions);

    if (score === null) {
      continue;
    }

    if (bestScore === null || score < bestScore) {
      bestEntry = entry;
      bestScore = score;
    }
  }

  return bestEntry ?? entries[0];
}

function buildRecentlyReviewedCompetitionGroups(
  entries: RecentlyReviewedEntry[],
  standingPositions: Map<string, Map<string, number>>,
  now = new Date(),
): RecentlyReviewedCompetitionGroup[] {
  const activeAfterMs =
    now.getTime() - RECENTLY_REVIEWED_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const groupsByKey = new Map<string, RecentlyReviewedEntry[]>();

  for (const entry of entries) {
    const key = getRecentlyReviewedGroupKey(entry.row.match);

    if (!key) {
      continue;
    }

    const group = groupsByKey.get(key) ?? [];

    if (group.length < RECENTLY_REVIEWED_COMPETITION_CAP) {
      group.push(entry);
    }

    groupsByKey.set(key, group);
  }

  return [...groupsByKey.values()]
    .filter((entriesForGroup) => entriesForGroup.length > 0)
    .filter((entriesForGroup) => {
      const latestReviewAt = entriesForGroup[0]!.match.recapGeneratedAt;

      return Date.parse(latestReviewAt) >= activeAfterMs;
    })
    .slice(0, RECENTLY_REVIEWED_GROUP_LIMIT)
    .map((entriesForGroup) => {
      const heroEntry = pickRecentlyReviewedHero(
        entriesForGroup,
        standingPositions,
      );
      const hero = heroEntry!.match;
      const compact = entriesForGroup
        .filter((entry) => entry.match.id !== hero.id)
        .map((entry) => entry.match);

      return {
        compact,
        competition: hero.competition,
        hero,
        latestReviewAt: entriesForGroup[0]!.match.recapGeneratedAt,
        poolName: hero.poolName,
        round: hero.round,
        roundName: hero.roundName,
      };
    });
}

function getRecentlyReviewedCompetitionIds(
  entries: RecentlyReviewedEntry[],
): string[] {
  return [
    ...new Set(
      entries
        .map((entry) => entry.match.competition.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

async function getRecentlyReviewedEntries(
  language?: "ja" | "en",
): Promise<RecentlyReviewedEntry[]> {
  const client = getSupabasePublicServerClient();
  let query = client
    .from("match_content")
    .select(RECENTLY_REVIEWED_MATCH_SELECT)
    .eq("content_type", "recap")
    .eq("status", "published")
    .order("generated_at", { ascending: false });

  if (language) {
    query = query.eq("language", language);
  }

  const { data, error } = await query.limit(RECENTLY_REVIEWED_CANDIDATE_LIMIT);

  if (error) {
    throw error;
  }

  return ((data ?? []) as RecentlyReviewedContentRow[])
    .map((row) => ({ match: mapRecentlyReviewedContentRow(row), row }))
    .filter(
      (entry): entry is RecentlyReviewedEntry =>
        entry.match !== null && entry.row.match !== null,
    );
}

export async function getRecentlyReviewedCompetitionGroups(
  language?: "ja" | "en",
): Promise<RecentlyReviewedCompetitionGroup[]> {
  const entries = await getRecentlyReviewedEntries(language);

  if (entries.length === 0) {
    return [];
  }

  const standingPositions = await getStandingPositionLookupForCompetitions(
    getRecentlyReviewedCompetitionIds(entries),
  );

  return buildRecentlyReviewedCompetitionGroups(entries, standingPositions);
}

export async function getRecentlyReviewedMatches(
  language?: "ja" | "en",
): Promise<RecentlyReviewedMatch[]> {
  const [firstGroup] = await getRecentlyReviewedCompetitionGroups(language);

  return firstGroup ? [firstGroup.hero, ...firstGroup.compact] : [];
}

export async function getRecentlyReviewedMatchById(
  matchId: string,
  language?: "ja" | "en",
): Promise<RecentlyReviewedMatch | null> {
  const client = getSupabasePublicServerClient();
  let query = client
    .from("match_content")
    .select(RECENTLY_REVIEWED_MATCH_SELECT)
    .eq("content_type", "recap")
    .eq("status", "published")
    .eq("match_id", matchId);

  if (language) {
    query = query.eq("language", language);
  }

  const { data, error } = await query
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? mapRecentlyReviewedContentRow(data satisfies RecentlyReviewedContentRow)
    : null;
}

export async function getRecentlyReviewedFamilies(
  limit = 4,
): Promise<ReviewedFamily[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        generated_at,
        match:matches!match_content_match_id_fkey (
          competition:competitions!matches_competition_id_fkey (
            slug,
            name,
            season,
            family
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

  const seen = new Set<string>();
  const result: ReviewedFamily[] = [];

  for (const row of data satisfies RecentlyReviewedFamilyContentRow[]) {
    const comp = row.match?.competition;

    if (!comp || seen.has(comp.family)) {
      continue;
    }

    seen.add(comp.family);
    result.push({
      competitionName: getCompetitionDisplayName({
        family: comp.family,
        name: comp.name,
        nameJa: null,
        slug: comp.slug,
      }),
      competitionSeason: comp.season,
      competitionSlug: comp.slug,
      family: comp.family,
      latestReviewAt: row.generated_at,
    });

    if (result.length >= limit) {
      break;
    }
  }

  return result;
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
        match:matches!inner (
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
          competition:competitions!inner (
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
    .eq("match.competition.family", family)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data satisfies Array<{ match: RecentlyReviewedMatchRow | null }>).map(
    (row) => {
      if (!row.match) {
        throw new Error("Recently reviewed family match is missing match.");
      }

      return mapMatchRow(row.match);
    },
  );
}

export async function getRecentLeagueOneEnglishRecaps(
  limit = 5,
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
    .eq("language", "en")
    .eq("status", "published")
    .order("generated_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data satisfies Array<{ match: RecentlyReviewedMatchRow | null }>)
    .filter((row) => row.match?.competition?.family === "league-one")
    .slice(0, limit)
    .map((row) => {
      if (!row.match) {
        throw new Error("Recent League One English recap is missing match.");
      }

      return mapMatchRow(row.match);
    });
}

async function loadUpcomingMatches(limit = 5): Promise<UpcomingMatch[]> {
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
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        away_team:teams!matches_away_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        competition:competitions!matches_competition_id_fkey (
          id,
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
        competition: mapCompetitionRow(row.competition),
      };
    });
}

export const getUpcomingMatches = cache(
  unstable_cache(loadUpcomingMatches, ["public-data", "upcoming-matches"], {
    revalidate: 300,
    tags: [PUBLIC_DATA_CACHE_TAGS.matches],
  }),
);

export async function getNextMatchForCompetition({
  family,
  season,
}: {
  family: string;
  season: string;
}): Promise<UpcomingMatch | null> {
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
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        away_team:teams!matches_away_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        competition:competitions!matches_competition_id_fkey!inner (
          id,
          family,
          slug,
          name,
          season
        )
      `,
    )
    .eq("status", "scheduled")
    .eq("competition.family", family)
    .eq("competition.season", season)
    .gte("kickoff_at", now)
    .order("kickoff_at", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = (data satisfies UpcomingMatchRow[])[0] ?? null;

  if (!row) {
    return null;
  }

  if (!row.competition) {
    throw new Error("Featured competition match is missing competition.");
  }

  return {
    ...mapMatchRow(row),
    competition: mapCompetitionRow(row.competition),
  };
}

export async function getNextUpcomingMatch(): Promise<UpcomingMatch | null> {
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
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        away_team:teams!matches_away_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        competition:competitions!matches_competition_id_fkey!inner (
          id,
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
    .limit(1);

  if (error) {
    throw error;
  }

  const row = (data satisfies UpcomingMatchRow[])[0] ?? null;

  if (!row) {
    return null;
  }

  if (!row.competition) {
    throw new Error("Next upcoming match is missing competition.");
  }

  return {
    ...mapMatchRow(row),
    competition: mapCompetitionRow(row.competition),
  };
}

export async function getNextMatchesForTeams({
  afterIso,
  excludeMatchId,
  teamIds,
}: {
  afterIso: string;
  excludeMatchId?: string;
  teamIds: string[];
}): Promise<TeamNextMatch[]> {
  const uniqueTeamIds = [...new Set(teamIds)].filter(Boolean);

  if (uniqueTeamIds.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const teamFilters = uniqueTeamIds
    .flatMap((teamId) => [
      `home_team_id.eq.${teamId}`,
      `away_team_id.eq.${teamId}`,
    ])
    .join(",");
  let query = client
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
        home_team_id,
        away_team_id,
        home_team:teams!matches_home_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        away_team:teams!matches_away_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          world_ranking
        ),
        competition:competitions!matches_competition_id_fkey (
          id,
          family,
          slug,
          name,
          name_ja,
          season
        )
      `,
    )
    .eq("status", "scheduled");

  if (excludeMatchId) {
    query = query.neq("id", excludeMatchId);
  }

  const { data, error } = await query
    .gte("kickoff_at", afterIso)
    .or(teamFilters)
    .order("kickoff_at", { ascending: true })
    .limit(20);

  if (error) {
    throw error;
  }

  const byTeam = new Map<string, TeamNextMatch>();

  for (const row of (data ?? []) as Array<
    UpcomingMatchRow & { away_team_id: string; home_team_id: string }
  >) {
    if (!row.competition) {
      continue;
    }

    const match = {
      ...mapMatchRow(row),
      competition: mapCompetitionRow(row.competition),
    };

    for (const teamId of [row.home_team_id, row.away_team_id]) {
      if (uniqueTeamIds.includes(teamId) && !byTeam.has(teamId)) {
        byTeam.set(teamId, { match, teamId });
      }
    }

    if (byTeam.size === uniqueTeamIds.length) {
      break;
    }
  }

  return uniqueTeamIds
    .map((teamId) => byTeam.get(teamId))
    .filter((entry): entry is TeamNextMatch => entry !== undefined);
}

export async function getNextMatchForTeamSlug(
  teamSlug: string,
  afterIso: string,
): Promise<UpcomingMatch | null> {
  const team = await getHeadToHeadTeamBySlug(teamSlug);

  if (!team) {
    return null;
  }

  const [nextMatch] = await getNextMatchesForTeams({
    afterIso,
    teamIds: [team.id],
  });

  return nextMatch?.match ?? null;
}

export async function getRelatedPublishedRecapsForMatch({
  competitionSlug,
  excludeMatchId,
  limit = 2,
  round,
}: {
  competitionSlug: string;
  excludeMatchId: string;
  limit?: number;
  round: number | null;
}): Promise<RecentlyReviewedMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        generated_at,
        content_md,
        match:matches!inner (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          venue,
          external_ids,
          home_team:teams!matches_home_team_id_fkey (
            id,
            slug,
            name,
            short_code,
            world_ranking
          ),
          away_team:teams!matches_away_team_id_fkey (
            id,
            slug,
            name,
            short_code,
            world_ranking
          ),
          competition:competitions!inner (
            id,
            family,
            slug,
            name,
            name_ja,
            season
          )
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("language", "ja")
    .eq("status", "published")
    .eq("match.competition.slug", competitionSlug)
    .neq("match_id", excludeMatchId)
    .order("generated_at", { ascending: false })
    .limit(Math.max(limit * 4, limit));

  if (error) {
    throw error;
  }

  const candidates = ((data ?? []) as RecentlyReviewedContentRow[])
    .map(mapRecentlyReviewedContentRow)
    .filter((match): match is RecentlyReviewedMatch => match !== null);
  const sameRound =
    round === null ? [] : candidates.filter((match) => match.round === round);
  const fallback = candidates.filter((match) => match.round !== round);
  const seen = new Set<string>();

  return [...sameRound, ...fallback]
    .filter((match) => {
      if (seen.has(match.id)) {
        return false;
      }

      seen.add(match.id);
      return true;
    })
    .slice(0, limit);
}

function sortCalendarMatches(matches: CalendarMatch[]): CalendarMatch[] {
  return [...matches].sort((a, b) => {
    const kickoff = a.kickoffAt.localeCompare(b.kickoffAt);
    if (kickoff !== 0) {
      return kickoff;
    }

    const competition = a.competition.name.localeCompare(b.competition.name);
    if (competition !== 0) {
      return competition;
    }

    const home = a.homeTeam.name.localeCompare(b.homeTeam.name);
    if (home !== 0) {
      return home;
    }

    return a.awayTeam.name.localeCompare(b.awayTeam.name);
  });
}

export async function getMatchesInRange(
  startUtcIso: string,
  endUtcIso: string,
): Promise<CalendarMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        id,
        broadcast_jp_url,
        kickoff_at,
        updated_at,
        status,
        home_score,
        away_score,
        venue,
        external_ids,
        home_team:teams!matches_home_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          flag_code,
          world_ranking
        ),
        away_team:teams!matches_away_team_id_fkey (
          id,
          slug,
          name,
          short_code,
          flag_code,
          world_ranking
        ),
        competition:competitions!matches_competition_id_fkey (
          id,
          family,
          slug,
          name,
          season
        )
      `,
    )
    .gte("kickoff_at", startUtcIso)
    .lt("kickoff_at", endUtcIso)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data satisfies UpcomingMatchRow[]).filter(
    (row) => row.competition !== null,
  );
  const matchIds = rows.map((row) => row.id);
  const previewMatchIds = new Set<string>();
  const recapMatchIds = new Set<string>();
  const broadcastMatchIds = await getMatchBroadcastPresenceForMatches(matchIds);

  if (matchIds.length > 0) {
    const { data: contentRows, error: contentError } = await client
      .from("match_content")
      .select("match_id, content_type")
      .in("match_id", matchIds)
      .eq("language", "ja")
      .eq("status", "published")
      .in("content_type", ["preview", "recap"]);

    if (contentError) {
      throw contentError;
    }

    for (const row of (contentRows ?? []) as MatchContentIdRow[]) {
      if (row.content_type === "recap") {
        recapMatchIds.add(row.match_id);
      } else if (row.content_type === "preview") {
        previewMatchIds.add(row.match_id);
      }
    }
  }

  return sortCalendarMatches(
    rows.map((row) => {
      if (!row.competition) {
        throw new Error("Calendar match is missing competition.");
      }

      return {
        ...mapMatchRow(row),
        competition: mapCompetitionRow(row.competition),
        hasBroadcasts: broadcastMatchIds.has(row.id),
        hasPreview: previewMatchIds.has(row.id),
        hasRecap: recapMatchIds.has(row.id),
      };
    }),
  );
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
          family,
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
      competition: mapCompetitionRow(row.competition),
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
    updatedAt: new Date().toISOString(),
  }));
}

export async function listMatchIdsWithContent(): Promise<SitemapMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        generated_at,
        match_id,
        match:matches!match_content_match_id_fkey (
          competition:competitions!matches_competition_id_fkey (
            family,
            slug
          )
        )
      `,
    )
    .eq("status", "published")
    .order("generated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const seen = new Set<string>();
  const result: SitemapMatch[] = [];

  for (const row of (data ?? []) as unknown as SitemapContentMatchRow[]) {
    if (seen.has(row.match_id)) {
      continue;
    }

    seen.add(row.match_id);
    const competition = row.match?.competition ?? null;
    result.push({
      competitionFamily:
        competition?.family ??
        competition?.slug.replace(/-\d{4}(-\d{2})?$/, "") ??
        null,
      id: row.match_id,
      updatedAt: row.generated_at,
    });
  }

  return result;
}

export function mapRoundHubRowsToParams(
  rows: RoundHubQueryRow[],
): RoundHubParam[] {
  const byKey = new Map<string, RoundHubParam>();

  for (const row of rows) {
    const round = getRoundFromExternalIds(row.external_ids);
    const competition = row.competition;

    if (!competition || round === null) {
      continue;
    }

    const key = `${competition.family}:${competition.season}:${round}`;
    const existing = byKey.get(key);

    if (!existing || row.kickoff_at > existing.updatedAt) {
      byKey.set(key, {
        competition: competition.family,
        round,
        season: competition.season,
        updatedAt: row.kickoff_at,
      });
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const competitionOrder = left.competition.localeCompare(right.competition);

    if (competitionOrder !== 0) {
      return competitionOrder;
    }

    const seasonOrder = right.season.localeCompare(left.season);

    if (seasonOrder !== 0) {
      return seasonOrder;
    }

    return left.round - right.round;
  });
}

export async function listRoundHubParams(): Promise<RoundHubParam[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        kickoff_at,
        external_ids,
        competition:competitions!matches_competition_id_fkey (
          family,
          season
        )
      `,
    )
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return mapRoundHubRowsToParams((data ?? []) as RoundHubQueryRow[]);
}

export async function listRoundsForCompetition(
  competition: string,
  season: string,
): Promise<number[]> {
  const matches = await listMatchesForCompetition(`${competition}-${season}`);

  return [...new Set(matches.map((match) => match.round))]
    .filter((round): round is number => round !== null)
    .sort((left, right) => left - right);
}

export async function getRoundMatches(
  competition: string,
  season: string,
  round: number,
): Promise<MatchListItem[]> {
  const matches = await listMatchesForCompetition(`${competition}-${season}`);

  return matches.filter((match) => match.round === round);
}

export function normalizeHeadToHeadSlug(
  teamSlugA: string,
  teamSlugB: string,
): string {
  return [teamSlugA, teamSlugB]
    .sort((left, right) => left.localeCompare(right))
    .join("-vs-");
}

export function parseHeadToHeadSlug(
  pairSlug: string,
): { teamSlugA: string; teamSlugB: string } | null {
  const parts = pairSlug.split("-vs-");

  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
    return null;
  }

  return {
    teamSlugA: parts[0],
    teamSlugB: parts[1],
  };
}

export function mapHeadToHeadRowsToPairs(
  rows: HeadToHeadPairQueryRow[],
  limit = 200,
): HeadToHeadPair[] {
  const bySlug = new Map<string, HeadToHeadPair>();

  for (const row of rows) {
    if (!row.home_team || !row.away_team) {
      continue;
    }

    const [teamA, teamB] = sortHeadToHeadTeamRows(row.home_team, row.away_team);
    const slug = normalizeHeadToHeadSlug(teamA.slug, teamB.slug);
    const existing = bySlug.get(slug);

    if (!existing) {
      bySlug.set(slug, {
        matchCount: 1,
        slug,
        teamA: mapHeadToHeadTeam(teamA),
        teamB: mapHeadToHeadTeam(teamB),
        updatedAt: row.kickoff_at,
      });
      continue;
    }

    existing.matchCount += 1;
    if (row.kickoff_at > existing.updatedAt) {
      existing.updatedAt = row.kickoff_at;
    }
  }

  return [...bySlug.values()]
    .sort((left, right) => {
      const countOrder = right.matchCount - left.matchCount;

      if (countOrder !== 0) {
        return countOrder;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, limit);
}

export async function listHeadToHeadPairs(
  limit = 200,
): Promise<HeadToHeadPair[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        kickoff_at,
        home_team:teams!matches_home_team_id_fkey (
          id,
          slug,
          name,
          short_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          id,
          slug,
          name,
          short_code
        )
      `,
    )
    .order("kickoff_at", { ascending: false });

  if (error) {
    throw error;
  }

  return mapHeadToHeadRowsToPairs(
    (data ?? []) as unknown as HeadToHeadPairQueryRow[],
    limit,
  );
}

export async function getHeadToHeadMatches(
  teamSlugA: string,
  teamSlugB: string,
): Promise<HeadToHeadMatch[]> {
  if (teamSlugA === teamSlugB) {
    return [];
  }

  const [teamA, teamB] = await Promise.all([
    getHeadToHeadTeamBySlug(teamSlugA),
    getHeadToHeadTeamBySlug(teamSlugB),
  ]);

  if (!teamA || !teamB) {
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
        ),
        competition:competitions!matches_competition_id_fkey (
          slug,
          name,
          season
        )
      `,
    )
    .or(
      `and(home_team_id.eq.${teamA.id},away_team_id.eq.${teamB.id}),and(home_team_id.eq.${teamB.id},away_team_id.eq.${teamA.id})`,
    )
    .order("kickoff_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as HeadToHeadMatchRow[])
    .filter((row) => row.competition !== null)
    .map((row) => {
      if (!row.competition) {
        throw new Error("Head-to-head match is missing competition.");
      }

      return {
        ...mapMatchRow(row),
        competition: mapCompetitionRow(row.competition),
      };
    });
}

export async function getHeadToHeadPageData(
  teamSlugA: string,
  teamSlugB: string,
): Promise<HeadToHeadPageData | null> {
  if (teamSlugA === teamSlugB) {
    return null;
  }

  const [teamA, teamB, matches] = await Promise.all([
    getHeadToHeadTeamBySlug(teamSlugA),
    getHeadToHeadTeamBySlug(teamSlugB),
    getHeadToHeadMatches(teamSlugA, teamSlugB),
  ]);

  if (!teamA || !teamB || matches.length === 0) {
    return null;
  }

  const [canonicalTeamA, canonicalTeamB] = sortHeadToHeadTeamRows(teamA, teamB);

  return {
    canonicalSlug: normalizeHeadToHeadSlug(
      canonicalTeamA.slug,
      canonicalTeamB.slug,
    ),
    matches,
    teamA: mapHeadToHeadTeam(canonicalTeamA),
    teamB: mapHeadToHeadTeam(canonicalTeamB),
  };
}

export async function countHeadToHeadMatches(
  teamSlugA: string,
  teamSlugB: string,
): Promise<number> {
  if (teamSlugA === teamSlugB) {
    return 0;
  }

  const [teamA, teamB] = await Promise.all([
    getHeadToHeadTeamBySlug(teamSlugA),
    getHeadToHeadTeamBySlug(teamSlugB),
  ]);

  if (!teamA || !teamB) {
    return 0;
  }

  const client = getSupabasePublicServerClient();
  const { count, error } = await client
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(
      `and(home_team_id.eq.${teamA.id},away_team_id.eq.${teamB.id}),and(home_team_id.eq.${teamB.id},away_team_id.eq.${teamA.id})`,
    );

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getMatchContentEn(
  matchId: string,
): Promise<EnglishMatchContentBundle> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      "content_type, content_md, generated_at, model_version, prompt_version",
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
): Promise<HeadToHeadTeam | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("id, slug, name, short_code")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapHeadToHeadTeam(data satisfies HeadToHeadTeamRow);
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
        competition: mapCompetitionRow(row.competition),
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

export async function getPoolTeamsForMatch(
  competitionSlug: string,
  poolName: string,
): Promise<PoolTeam[]> {
  const competition = await getCompetitionBySlug(competitionSlug);

  if (!competition) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      `
        home_team:teams!matches_home_team_id_fkey (
          slug,
          name,
          name_ja
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          name_ja
        )
      `,
    )
    .eq("competition_id", competition.id)
    .filter("external_ids->>pool_name", "eq", poolName);

  if (error) {
    throw error;
  }

  const seen = new Set<string>();
  const teams: PoolTeam[] = [];

  for (const row of (data ?? []) as unknown as Array<{
    away_team: { slug: string; name: string; name_ja: string | null } | null;
    home_team: { slug: string; name: string; name_ja: string | null } | null;
  }>) {
    for (const team of [row.home_team, row.away_team]) {
      if (!team || seen.has(team.slug)) {
        continue;
      }

      const nameJa = team.name_ja ?? null;
      seen.add(team.slug);
      teams.push({
        name: getTeamDisplayName({
          name: team.name,
          nameJa,
          slug: team.slug,
        }),
        nameJa,
        slug: team.slug,
      });
    }
  }

  return teams.sort((left, right) => left.name.localeCompare(right.name));
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
        broadcast_jp_url,
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
          english_name,
          short_code,
          flag_code
        ),
        away_team:teams!matches_away_team_id_fkey (
          slug,
          name,
          english_name,
          short_code,
          flag_code
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

  const row = data as MatchDetailRow;
  const match = mapMatchRow(row);
  const broadcastsByMatch = await getMatchBroadcastsForMatches([matchId]);

  if (!row.competition) {
    throw new Error(`Match ${matchId} is missing competition relation.`);
  }

  const competition = row.competition;

  return {
    ...match,
    awayTeam: {
      ...match.awayTeam,
      englishName: row.away_team?.english_name ?? null,
    },
    awayTeamId: row.away_team_id,
    broadcasts: broadcastsByMatch.get(matchId) ?? [],
    competition: {
      family:
        competition?.family ??
        competition!.slug.replace(/-\d{4}(-\d{2})?$/, ""),
      name: competition!.name,
      nameJa: competition!.name_ja ?? null,
      season: competition!.season,
      slug: competition!.slug,
    },
    homeTeam: {
      ...match.homeTeam,
      englishName: row.home_team?.english_name ?? null,
    },
    homeTeamId: row.home_team_id,
  };
}
