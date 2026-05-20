import { getSupabaseServerClient } from "@/lib/db/server";
import {
  resolveRwc2027TeamSlug,
  RWC_2027_COMPETITION_SLUG,
  RWC_2027_POOL_ASSIGNMENTS,
  RWC_2027_POOL_PAGE_URLS,
  RWC_2027_SOURCE,
} from "@/lib/ingestion/sources/wikipedia-rwc";
import {
  parseWikipediaSixNations2027Html,
  SIX_NATIONS_2027_COMPETITION_SLUG,
  WIKIPEDIA_SIX_NATIONS_2027_SOURCE,
  WIKIPEDIA_SIX_NATIONS_2027_URL,
} from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import { upsertCompetitionStandings } from "@/lib/ingestion/standings";
import { upsertMatches } from "@/lib/ingestion/upsert";
import { fetchWithPolicy, saveRawData } from "@/lib/scrapers";
import { parseCompetitionStandingsHtml } from "@/lib/scrapers/wikipedia-standings";

import type { Json } from "@/lib/db/types";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";

type TeamLookup = Record<string, string>;

type ParsedRwc2027PoolMatch = ParsedWikipediaMatch & {
  poolName: string;
  sourceUrl: string;
};

function toExternalIds(match: ParsedWikipediaMatch): Record<string, Json> {
  const externalIds: Record<string, Json> = {};

  if (match.round !== null) {
    externalIds.wikipedia_round = match.round;
  }

  if (match.eventId) {
    externalIds.wikipedia_event_id = match.eventId;
  }

  return externalIds;
}

async function getCompetitionId() {
  return getCompetitionIdBySlug(SIX_NATIONS_2027_COMPETITION_SLUG);
}

async function getCompetitionIdBySlug(competitionSlug: string) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function getTeamLookup(teamNames: string[]): Promise<TeamLookup> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("teams")
    .select("id, name")
    .in("name", [...new Set(teamNames)]);

  if (error) {
    throw error;
  }

  return Object.fromEntries(data.map((team) => [team.name, team.id]));
}

async function getTeamLookupBySlug(teamSlugs: string[]): Promise<TeamLookup> {
  const client = getSupabaseServerClient();
  const uniqueSlugs = [...new Set(teamSlugs)].sort();
  const { data, error } = await client
    .from("teams")
    .select("id, slug")
    .in("slug", uniqueSlugs);

  if (error) {
    throw error;
  }

  const lookup = Object.fromEntries(
    (data ?? []).map((team) => [team.slug, team.id]),
  );
  const missing = uniqueSlugs.filter((slug) => !lookup[slug]);

  if (missing.length > 0) {
    throw new Error(`Unknown team slug(s): ${missing.join(", ")}`);
  }

  return lookup;
}

function resolveParsedMatches(
  parsedMatches: ParsedWikipediaMatch[],
  competitionId: string,
  teamLookup: TeamLookup,
) {
  return parsedMatches.flatMap((match) => {
    const homeTeamId = teamLookup[match.homeTeamName];
    const awayTeamId = teamLookup[match.awayTeamName];

    if (!homeTeamId || !awayTeamId) {
      console.warn(
        `Skipping Wikipedia fixture because a team is missing from seed data: ${match.homeTeamName} vs ${match.awayTeamName}`,
      );

      return [];
    }

    return [
      {
        awayScore: match.awayScore,
        awayTeamId,
        competitionId,
        externalIds: toExternalIds(match),
        homeScore: match.homeScore,
        homeTeamId,
        kickoffAt: match.kickoffAt,
        rawHtml: match.rawHtml,
        status: match.status,
        venue: match.venue,
      },
    ];
  });
}

function toRwc2027ExternalIds(
  match: ParsedRwc2027PoolMatch,
): Record<string, Json> {
  return {
    phase: "pool",
    pool_name: match.poolName,
    round_name: match.poolName,
    source: RWC_2027_SOURCE,
    wikipedia_event_id: match.eventId,
    wikipedia_url: match.sourceUrl,
  };
}

function resolveRwc2027ParsedMatches(
  parsedMatches: ParsedRwc2027PoolMatch[],
  competitionId: string,
  teamLookupBySlug: TeamLookup,
) {
  return parsedMatches.map((match) => {
    const homeTeamSlug = resolveRwc2027TeamSlug(match.homeTeamName);
    const awayTeamSlug = resolveRwc2027TeamSlug(match.awayTeamName);
    const homeTeamId = teamLookupBySlug[homeTeamSlug];
    const awayTeamId = teamLookupBySlug[awayTeamSlug];

    if (!homeTeamId || !awayTeamId) {
      throw new Error(
        `RWC 2027 fixture references a missing team: ${match.homeTeamName} vs ${match.awayTeamName}`,
      );
    }

    return {
      awayScore: match.awayScore,
      awayTeamId,
      competitionId,
      externalIds: toRwc2027ExternalIds(match),
      homeScore: match.homeScore,
      homeTeamId,
      kickoffAt: match.kickoffAt,
      rawHtml: match.rawHtml,
      sourceUrl: match.sourceUrl,
      status: match.status,
      venue: match.venue,
    };
  });
}

async function upsertCompetitionTeams(
  competitionId: string,
  teamLookupBySlug: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = Object.values(teamLookupBySlug).map((teamId) => ({
    competition_id: competitionId,
    team_id: teamId,
  }));
  const { error } = await client
    .from("competition_teams")
    .upsert(rows, { onConflict: "competition_id,team_id" });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function upsertCompetitionPools(
  competitionId: string,
  teamLookupBySlug: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = Object.entries(RWC_2027_POOL_ASSIGNMENTS).map(
    ([slug, poolName]) => ({
      competition_id: competitionId,
      pool_name: poolName,
      team_id: teamLookupBySlug[slug]!,
    }),
  );
  const { error } = await client
    .from("competition_pools")
    .upsert(rows, { onConflict: "competition_id,team_id" });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function upsertEmptyRwc2027Standings(
  competitionId: string,
  teamLookupBySlug: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const { data: existingRows, error: existingError } = await client
    .from("competition_standings")
    .select("team_id")
    .eq("competition_id", competitionId);

  if (existingError) {
    throw existingError;
  }

  const existingTeamIds = new Set(
    (existingRows ?? []).map((row) => row.team_id),
  );
  const poolPositionByName = new Map<string, number>();
  const rows = Object.entries(RWC_2027_POOL_ASSIGNMENTS).flatMap(
    ([slug, poolName]) => {
      const position = (poolPositionByName.get(poolName) ?? 0) + 1;
      const teamId = teamLookupBySlug[slug]!;
      poolPositionByName.set(poolName, position);

      if (existingTeamIds.has(teamId)) {
        return [];
      }

      return [
        {
          bonus_points_losing: 0,
          bonus_points_try: 0,
          competition_id: competitionId,
          drawn: 0,
          lost: 0,
          played: 0,
          points_against: 0,
          points_for: 0,
          position,
          team_id: teamId,
          total_points: 0,
          tries_for: 0,
          updated_at: new Date().toISOString(),
          won: 0,
        },
      ];
    },
  );

  if (rows.length === 0) {
    return 0;
  }

  const { data, error } = await client
    .from("competition_standings")
    .insert(rows)
    .select("id");

  if (error) {
    throw error;
  }

  return data?.length ?? 0;
}

export async function ingestSixNations2027Fixtures() {
  const response = await fetchWithPolicy(WIKIPEDIA_SIX_NATIONS_2027_URL);
  const html = await response.text();
  const parsedMatches = parseWikipediaSixNations2027Html(html);
  const parsedStandings = parseCompetitionStandingsHtml(html);
  const competitionId = await getCompetitionId();
  const teamLookup = await getTeamLookup(
    parsedMatches
      .flatMap((match) => [match.homeTeamName, match.awayTeamName])
      .concat(parsedStandings.map((row) => row.teamName)),
  );
  const resolvedMatches = resolveParsedMatches(
    parsedMatches,
    competitionId,
    teamLookup,
  );
  const result = await upsertMatches(resolvedMatches);

  await Promise.all(
    result.records.map((record, index) =>
      saveRawData({
        matchId: record.id,
        payload: {
          external_ids: record.externalIds,
          html: resolvedMatches[index]?.rawHtml ?? "",
        },
        source: WIKIPEDIA_SIX_NATIONS_2027_SOURCE,
        sourceUrl: WIKIPEDIA_SIX_NATIONS_2027_URL,
      }),
    ),
  );

  const standingsResult = await upsertCompetitionStandings({
    competitionId,
    rows: parsedStandings,
    teamLookup,
  });

  console.info(
    `Ingested Six Nations 2027 fixtures: inserted=${result.matchesInserted} updated=${result.matchesUpdated} standings_upserted=${standingsResult.upserted}`,
  );

  return {
    competition: SIX_NATIONS_2027_COMPETITION_SLUG,
    counts: {
      matches_inserted: result.matchesInserted,
      matches_updated: result.matchesUpdated,
      raw_data_rows: result.records.length,
      standings_upserted: standingsResult.upserted,
    },
  };
}

export async function ingestRwc2027Fixtures() {
  const poolPages = await Promise.all(
    Object.entries(RWC_2027_POOL_PAGE_URLS).map(
      async ([poolName, sourceUrl]) => {
        const response = await fetchWithPolicy(sourceUrl);
        const html = await response.text();

        return {
          matches: parseWikipediaSixNations2027Html(html).map((match) => ({
            ...match,
            poolName,
            sourceUrl,
          })),
          poolName,
          sourceUrl,
        };
      },
    ),
  );
  const parsedMatches = poolPages.flatMap((page) => page.matches);
  const competitionId = await getCompetitionIdBySlug(RWC_2027_COMPETITION_SLUG);
  const teamLookupBySlug = await getTeamLookupBySlug(
    Object.keys(RWC_2027_POOL_ASSIGNMENTS),
  );
  const resolvedMatches = resolveRwc2027ParsedMatches(
    parsedMatches,
    competitionId,
    teamLookupBySlug,
  );
  const result = await upsertMatches(resolvedMatches);

  await Promise.all(
    result.records.map((record, index) =>
      saveRawData({
        matchId: record.id,
        payload: {
          external_ids: record.externalIds,
          html: resolvedMatches[index]?.rawHtml ?? "",
        },
        source: RWC_2027_SOURCE,
        sourceUrl: resolvedMatches[index]?.sourceUrl ?? "",
      }),
    ),
  );

  const [competitionTeamsUpserted, poolAssignmentsUpserted, standingsUpserted] =
    await Promise.all([
      upsertCompetitionTeams(competitionId, teamLookupBySlug),
      upsertCompetitionPools(competitionId, teamLookupBySlug),
      upsertEmptyRwc2027Standings(competitionId, teamLookupBySlug),
    ]);

  console.info(
    `Ingested RWC 2027 fixtures: inserted=${result.matchesInserted} updated=${result.matchesUpdated} raw=${result.records.length} pools=${poolAssignmentsUpserted}`,
  );

  return {
    competition: RWC_2027_COMPETITION_SLUG,
    counts: {
      competition_teams_upserted: competitionTeamsUpserted,
      matches_inserted: result.matchesInserted,
      matches_updated: result.matchesUpdated,
      pool_assignments_upserted: poolAssignmentsUpserted,
      raw_data_rows: result.records.length,
      standings_upserted: standingsUpserted,
    },
  };
}
