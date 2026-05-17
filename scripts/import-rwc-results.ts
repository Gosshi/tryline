import { getSupabaseServerClient } from "@/lib/db/server";
import {
  resolveRwcTeamSlug,
  RWC_2023_COMPETITION_SLUG,
  RWC_2023_FAMILY,
  RWC_2023_POOL_ASSIGNMENTS,
  RWC_2023_POOL_PAGE_URLS,
  RWC_2023_SEASON,
  RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME,
  RWC_2023_WIKIPEDIA_URL,
} from "@/lib/ingestion/sources/wikipedia-rwc";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { upsertCompetitionStandings } from "@/lib/ingestion/standings";
import { upsertMatches } from "@/lib/ingestion/upsert";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";
import { parseRwcHtml } from "@/lib/scrapers/wikipedia-rwc-results";

import type { Json } from "@/lib/db/types";
import type { ParsedStandingsRow } from "@/lib/scrapers/wikipedia-standings";

type CliOptions = {
  season: string;
};

type TeamRow = {
  id: string;
  slug: string;
};

type TeamStanding = {
  bonusPointsLosing: number;
  bonusPointsTry: number;
  drawn: number;
  lost: number;
  played: number;
  pointsAgainst: number;
  pointsFor: number;
  teamName: string;
  triesFor: number;
  won: number;
};

type FinishedPoolMatch = {
  awayScore: number;
  awayTeamName: string;
  homeScore: number;
  homeTeamName: string;
};

const EXPECTED_MATCH_COUNT = 48;

function parseOptions(argv: string[]): CliOptions {
  let season: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--season") {
      season = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--season=")) {
      season = arg.slice("--season=".length);
      continue;
    }

    console.error("Usage: pnpm tsx scripts/import-rwc-results.ts --season 2023");
    process.exit(1);
  }

  if (season !== RWC_2023_SEASON) {
    console.error("Only --season 2023 is supported.");
    process.exit(1);
  }

  return { season };
}

function getCompetitionDates(kickoffDates: string[]) {
  const dates = kickoffDates
    .map((kickoffAt) => kickoffAt.slice(0, 10))
    .sort((left, right) => left.localeCompare(right));
  const startDate = dates[0];
  const endDate = dates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Unable to derive Rugby World Cup 2023 competition dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(kickoffDates: string[]) {
  const client = getSupabaseServerClient();
  const { endDate, startDate } = getCompetitionDates(kickoffDates);
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: endDate,
        family: RWC_2023_FAMILY,
        name: "Rugby World Cup 2023",
        season: RWC_2023_SEASON,
        slug: RWC_2023_COMPETITION_SLUG,
        start_date: startDate,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function getTeamLookup(teamSlugs: string[]) {
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
    ((data ?? []) as TeamRow[]).map((team) => [team.slug, team.id]),
  );
  const missing = uniqueSlugs.filter((slug) => !lookup[slug]);

  if (missing.length > 0) {
    throw new Error(`Unknown team slug(s): ${missing.join(", ")}`);
  }

  return lookup;
}

function buildExternalIds(match: ReturnType<typeof parseRwcHtml>[number]): Record<string, Json> {
  return {
    phase: match.phase,
    pool_name: match.pool_name,
    source: "wikipedia",
    wikipedia_event_id: match.event_id,
    wikipedia_round: match.round,
    wikipedia_url: match.source_url,
  };
}

async function upsertCompetitionTeams(competitionId: string, teamLookup: Record<string, string>) {
  const client = getSupabaseServerClient();
  const rows = Object.values(teamLookup).map((teamId) => ({
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

async function upsertCompetitionPools(competitionId: string, teamLookup: Record<string, string>) {
  const client = getSupabaseServerClient();
  const rows = Object.entries(RWC_2023_POOL_ASSIGNMENTS).map(([slug, poolName]) => ({
    competition_id: competitionId,
    pool_name: poolName,
    team_id: teamLookup[slug]!,
  }));
  const { error } = await client
    .from("competition_pools")
    .upsert(rows, { onConflict: "competition_id,team_id" });

  if (error) {
    throw error;
  }

  return rows.length;
}

function createEmptyStanding(teamName: string): TeamStanding {
  return {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 0,
    played: 0,
    pointsAgainst: 0,
    pointsFor: 0,
    teamName,
    triesFor: 0,
    won: 0,
  };
}

function addMatchResult(params: {
  standing: TeamStanding;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
}) {
  const { standing, pointsFor, pointsAgainst, triesFor } = params;
  const scoreDifference = pointsFor - pointsAgainst;

  standing.played += 1;
  standing.pointsFor += pointsFor;
  standing.pointsAgainst += pointsAgainst;
  standing.triesFor += triesFor;

  if (scoreDifference > 0) {
    standing.won += 1;
  } else if (scoreDifference === 0) {
    standing.drawn += 1;
  } else {
    standing.lost += 1;
  }

  if (triesFor >= 4) {
    standing.bonusPointsTry += 1;
  }

  if (scoreDifference < 0 && Math.abs(scoreDifference) <= 7) {
    standing.bonusPointsLosing += 1;
  }
}

function compareHeadToHead(
  left: TeamStanding,
  right: TeamStanding,
  matches: FinishedPoolMatch[],
) {
  const directMatch = matches.find(
    (match) =>
      (match.homeTeamName === left.teamName && match.awayTeamName === right.teamName) ||
      (match.homeTeamName === right.teamName && match.awayTeamName === left.teamName),
  );

  if (!directMatch) {
    return 0;
  }

  const leftPoints =
    directMatch.homeTeamName === left.teamName
      ? directMatch.homeScore
      : directMatch.awayScore;
  const rightPoints =
    directMatch.homeTeamName === right.teamName
      ? directMatch.homeScore
      : directMatch.awayScore;

  if (leftPoints === rightPoints) {
    return 0;
  }

  return rightPoints - leftPoints;
}

function toParsedStandingsRows(
  standings: Map<string, TeamStanding>,
  matches: FinishedPoolMatch[],
): ParsedStandingsRow[] {
  return [...standings.values()]
    .map((standing) => ({
      ...standing,
      position: 0,
      totalPoints:
        standing.won * 4 +
        standing.drawn * 2 +
        standing.bonusPointsTry +
        standing.bonusPointsLosing,
    }))
    .sort((left, right) => {
      const totalPointsDiff = right.totalPoints - left.totalPoints;

      if (totalPointsDiff !== 0) {
        return totalPointsDiff;
      }

      const headToHeadDiff = compareHeadToHead(left, right, matches);

      if (headToHeadDiff !== 0) {
        return headToHeadDiff;
      }

      const scoreDiffLeft = left.pointsFor - left.pointsAgainst;
      const scoreDiffRight = right.pointsFor - right.pointsAgainst;

      if (scoreDiffRight !== scoreDiffLeft) {
        return scoreDiffRight - scoreDiffLeft;
      }

      return right.pointsFor - left.pointsFor;
    })
    .map((standing, index) => ({ ...standing, position: index + 1 }));
}

async function buildPoolStandings(): Promise<ParsedStandingsRow[]> {
  const allRows: ParsedStandingsRow[] = [];

  for (const [poolName, url] of Object.entries(RWC_2023_POOL_PAGE_URLS)) {
    const response = await fetchWithPolicy(url);
    const html = await response.text();
    const matches = parseWikipediaSixNationsHtml(html);
    const standings = new Map<string, TeamStanding>();
    const finishedMatches: FinishedPoolMatch[] = [];

    for (const match of matches) {
      if (match.status !== "finished") {
        continue;
      }

      const homeTeamName = match.homeTeamName;
      const awayTeamName = match.awayTeamName;

      resolveRwcTeamSlug(homeTeamName);
      resolveRwcTeamSlug(awayTeamName);

      const homeStanding =
        standings.get(homeTeamName) ?? createEmptyStanding(homeTeamName);
      const awayStanding =
        standings.get(awayTeamName) ?? createEmptyStanding(awayTeamName);
      const events = parseMatchEventsFromVeventHtml(match.rawHtml);
      const homeTries = events.filter(
        (event) => event.type === "try" && event.teamSide === "home",
      ).length;
      const awayTries = events.filter(
        (event) => event.type === "try" && event.teamSide === "away",
      ).length;

      addMatchResult({
        pointsAgainst: match.awayScore ?? 0,
        pointsFor: match.homeScore ?? 0,
        standing: homeStanding,
        triesFor: homeTries,
      });
      addMatchResult({
        pointsAgainst: match.homeScore ?? 0,
        pointsFor: match.awayScore ?? 0,
        standing: awayStanding,
        triesFor: awayTries,
      });
      finishedMatches.push({
        awayScore: match.awayScore ?? 0,
        awayTeamName,
        homeScore: match.homeScore ?? 0,
        homeTeamName,
      });
      standings.set(homeTeamName, homeStanding);
      standings.set(awayTeamName, awayStanding);
    }

    const rows = toParsedStandingsRows(standings, finishedMatches);

    if (rows.length !== 5) {
      throw new Error(`Expected 5 standings rows for ${poolName}, got ${rows.length}.`);
    }

    allRows.push(...rows);
  }

  return allRows;
}

async function main() {
  const { season } = parseOptions(process.argv.slice(2));
  const response = await fetchWithPolicy(RWC_2023_WIKIPEDIA_URL);
  const html = await response.text();
  const matches = parseRwcHtml(html, RWC_2023_WIKIPEDIA_URL);
  const poolStandings = await buildPoolStandings();

  if (season !== RWC_2023_SEASON) {
    throw new Error(`Unsupported season: ${season}`);
  }

  if (matches.length !== EXPECTED_MATCH_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_MATCH_COUNT} RWC 2023 matches, got ${matches.length}.`,
    );
  }

  const resolvedSlugs = matches.flatMap((match) => [
    resolveRwcTeamSlug(match.home_team_name),
    resolveRwcTeamSlug(match.away_team_name),
  ]);
  const teamLookup = await getTeamLookup(Object.keys(RWC_2023_POOL_ASSIGNMENTS));
  const competitionId = await upsertCompetition(matches.map((match) => match.kickoff_at));

  const upsertedMatches = await upsertMatches(
    matches.map((match) => ({
      awayScore: match.away_score,
      awayTeamId: teamLookup[resolveRwcTeamSlug(match.away_team_name)]!,
      competitionId,
      externalIds: buildExternalIds(match),
      homeScore: match.home_score,
      homeTeamId: teamLookup[resolveRwcTeamSlug(match.home_team_name)]!,
      kickoffAt: match.kickoff_at,
      status: match.status,
      venue: match.venue,
    })),
  );

  const competitionTeamsCount = await upsertCompetitionTeams(competitionId, teamLookup);
  const poolAssignmentsCount = await upsertCompetitionPools(competitionId, teamLookup);

  const standingsNameToTeamId = Object.fromEntries(
    Object.keys(teamLookup).map((slug) => {
      const teamName = Object.entries(RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME).find(
        ([, candidateSlug]) => candidateSlug === slug,
      );

      return [teamName?.[0] ?? slug, teamLookup[slug]!];
    }),
  );

  const standingsResult = await upsertCompetitionStandings({
    competitionId,
    rows: poolStandings,
    teamLookup: standingsNameToTeamId,
  });

  console.log(`Upserted competition: ${RWC_2023_COMPETITION_SLUG}`);
  console.log(
    `Teams resolved: ${new Set(resolvedSlugs).size}/${Object.keys(RWC_2023_POOL_ASSIGNMENTS).length}`,
  );
  console.log(
    `Matches upserted: ${upsertedMatches.matchesInserted + upsertedMatches.matchesUpdated} (40 pool + 8 knockout)`,
  );
  console.log(`Competition teams written: ${competitionTeamsCount}`);
  console.log(`Pool assignments written: ${poolAssignmentsCount}`);
  console.log(`Standings rows upserted: ${standingsResult.upserted}`);
}

if (process.argv[1]?.endsWith("import-rwc-results.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
