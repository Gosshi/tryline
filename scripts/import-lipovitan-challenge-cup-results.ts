import { getSupabaseServerClient } from "@/lib/db/server";
import {
  wikipediaLipovitanChallengeCupResultsScraper,
  type LipovitanChallengeCupMatchResult,
} from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

import type { Json } from "@/lib/db/types";

type TeamLookup = Record<string, string>;

const FAMILY = "lipovitan-challenge-cup";
const SEASON = "2026";
const EXPECTED_MATCH_COUNT = 4;

function parseSeasonArg(value: string | undefined) {
  if (value !== SEASON) {
    throw new Error(
      "Usage: pnpm tsx scripts/import-lipovitan-challenge-cup-results.ts 2026",
    );
  }

  return value;
}

function getCompetitionDates(results: LipovitanChallengeCupMatchResult[]) {
  const dates = results
    .map((result) => result.kickoff_at.slice(0, 10))
    .sort((left, right) => left.localeCompare(right));
  const startDate = dates[0];
  const endDate = dates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Unable to derive Lipovitan Challenge Cup competition dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(results: LipovitanChallengeCupMatchResult[]) {
  const client = getSupabaseServerClient();
  const { endDate, startDate } = getCompetitionDates(results);
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: endDate,
        family: FAMILY,
        name: "Lipovitan-D Challenge Cup 2026",
        name_ja: "リポビタンDチャレンジカップ2026",
        season: SEASON,
        slug: "lipovitan-challenge-cup-2026",
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

async function getTeamLookup(teamSlugs: string[]): Promise<TeamLookup> {
  const client = getSupabaseServerClient();
  const uniqueSlugs = [...new Set(teamSlugs)];
  const { data, error } = await client
    .from("teams")
    .select("id, slug")
    .in("slug", uniqueSlugs);

  if (error) {
    throw error;
  }

  const lookup = Object.fromEntries(data.map((team) => [team.slug, team.id]));
  const missingSlugs = uniqueSlugs.filter((slug) => !lookup[slug]);

  if (missingSlugs.length > 0) {
    throw new Error(`Unknown team slug(s): ${missingSlugs.join(", ")}`);
  }

  return lookup;
}

function buildExternalIds(
  result: LipovitanChallengeCupMatchResult,
): Record<string, Json> {
  return {
    source: "wikipedia",
    wikipedia_event_id: result.wikipedia_event_id,
    wikipedia_round: result.round,
    wikipedia_url: result.source_url,
  };
}

async function upsertMatches(
  results: LipovitanChallengeCupMatchResult[],
  competitionId: string,
  teamLookup: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = results.map((result) => {
    const homeTeamId = teamLookup[result.home_team_slug];
    const awayTeamId = teamLookup[result.away_team_slug];

    if (!homeTeamId || !awayTeamId) {
      throw new Error(
        `Unable to resolve team ids for ${result.home_team_slug} vs ${result.away_team_slug}`,
      );
    }

    return {
      away_score: result.away_score,
      away_team_id: awayTeamId,
      competition_id: competitionId,
      external_ids: buildExternalIds(result),
      home_score: result.home_score,
      home_team_id: homeTeamId,
      kickoff_at: result.kickoff_at,
      status: result.status,
      venue: result.venue,
    };
  });
  const { data, error } = await client
    .from("matches")
    .upsert(rows, {
      onConflict: "competition_id,home_team_id,away_team_id,kickoff_at",
    })
    .select("id");

  if (error) {
    throw error;
  }

  return data.length;
}

async function upsertCompetitionTeams(
  competitionId: string,
  teamLookup: TeamLookup,
) {
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

async function main() {
  const season = parseSeasonArg(process.argv[2]);
  const results =
    await wikipediaLipovitanChallengeCupResultsScraper.fetchResults(season);

  if (results.length !== EXPECTED_MATCH_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_MATCH_COUNT} Lipovitan Challenge Cup matches, got ${results.length}.`,
    );
  }

  const competitionId = await upsertCompetition(results);
  const teamLookup = await getTeamLookup(
    results.flatMap((result) => [result.home_team_slug, result.away_team_slug]),
  );
  const upsertedCount = await upsertMatches(results, competitionId, teamLookup);
  const teamCount = await upsertCompetitionTeams(competitionId, teamLookup);

  console.log(
    `Upserted ${upsertedCount} matches and ${teamCount} competition_teams for Lipovitan Challenge Cup ${SEASON}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
