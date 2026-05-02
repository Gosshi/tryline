import { getSupabaseServerClient } from "@/lib/db/server";
import {
  wikipediaPremiershipResultsScraper,
  type HistoricalMatchResult,
} from "@/lib/scrapers/wikipedia-premiership-results";

import type { Json } from "@/lib/db/types";

type TeamLookup = Record<string, string>;

const FAMILY = "premiership";
const EXPECTED_MATCH_COUNT = 90;

function parseSeasonArg(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    console.error(
      "Usage: pnpm tsx scripts/import-premiership-results.ts <YYYY-YY>",
    );
    process.exit(1);
  }

  return value;
}

function getCompetitionDates(results: HistoricalMatchResult[]) {
  const dates = results
    .map((result) => result.kickoff_at.slice(0, 10))
    .sort((a, b) => a.localeCompare(b));

  const startDate = dates[0];
  const endDate = dates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Unable to derive Premiership competition dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(
  season: string,
  results: HistoricalMatchResult[],
) {
  const client = getSupabaseServerClient();
  const { endDate, startDate } = getCompetitionDates(results);
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: endDate,
        family: FAMILY,
        name: `Premiership Rugby ${season}`,
        season,
        slug: `${FAMILY}-${season}`,
        start_date: startDate,
      },
      {
        onConflict: "slug",
      },
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
    console.error(`Unknown team slug(s): ${missingSlugs.join(", ")}`);
    process.exit(1);
  }

  return lookup;
}

function buildExternalIds(result: HistoricalMatchResult): Record<string, Json> {
  return {
    source: "wikipedia",
    wikipedia_event_id: result.wikipedia_event_id,
    wikipedia_round: result.round,
    wikipedia_url: result.source_url,
  };
}

async function upsertMatches(
  results: HistoricalMatchResult[],
  competitionId: string,
  teamLookup: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = results.map((result) => {
    const homeTeamId = teamLookup[result.home_team_slug];
    const awayTeamId = teamLookup[result.away_team_slug];

    if (!homeTeamId || !awayTeamId) {
      console.error(
        `Unable to resolve team ids for ${result.home_team_slug} vs ${result.away_team_slug}`,
      );
      process.exit(1);
    }

    return {
      away_score: result.away_score,
      away_team_id: awayTeamId,
      competition_id: competitionId,
      external_ids: buildExternalIds(result),
      home_score: result.home_score,
      home_team_id: homeTeamId,
      kickoff_at: result.kickoff_at,
      status: "finished",
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
  const results = await wikipediaPremiershipResultsScraper.fetchResults(season);

  if (results.length !== EXPECTED_MATCH_COUNT) {
    console.error(
      `Expected ${EXPECTED_MATCH_COUNT} finished Premiership ${season} regular season matches, got ${results.length}.`,
    );
    process.exit(1);
  }

  const competitionId = await upsertCompetition(season, results);
  const teamLookup = await getTeamLookup(
    results.flatMap((result) => [result.home_team_slug, result.away_team_slug]),
  );
  const upsertedCount = await upsertMatches(results, competitionId, teamLookup);
  const teamCount = await upsertCompetitionTeams(competitionId, teamLookup);

  console.log(
    `Upserted ${upsertedCount} matches and ${teamCount} competition_teams for Premiership ${season}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
