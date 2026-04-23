import { getSupabaseServerClient } from "@/lib/db/server";
import {
  parseWikipediaSixNations2027Html,
  SIX_NATIONS_2027_COMPETITION_SLUG,
  WIKIPEDIA_SIX_NATIONS_2027_SOURCE,
  WIKIPEDIA_SIX_NATIONS_2027_URL,
} from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import { upsertMatches } from "@/lib/ingestion/upsert";
import { fetchWithPolicy, saveRawData } from "@/lib/scrapers";

import type { Json } from "@/lib/db/types";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";

type TeamLookup = Record<string, string>;

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
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id")
    .eq("slug", SIX_NATIONS_2027_COMPETITION_SLUG)
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

export async function ingestSixNations2027Fixtures() {
  const response = await fetchWithPolicy(WIKIPEDIA_SIX_NATIONS_2027_URL);
  const html = await response.text();
  const parsedMatches = parseWikipediaSixNations2027Html(html);
  const competitionId = await getCompetitionId();
  const teamLookup = await getTeamLookup(
    parsedMatches.flatMap((match) => [match.homeTeamName, match.awayTeamName]),
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

  console.info(
    `Ingested Six Nations 2027 fixtures: inserted=${result.matchesInserted} updated=${result.matchesUpdated}`,
  );

  return {
    competition: SIX_NATIONS_2027_COMPETITION_SLUG,
    counts: {
      matches_inserted: result.matchesInserted,
      matches_updated: result.matchesUpdated,
      raw_data_rows: result.records.length,
    },
  };
}
