import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import {
  parseWikipediaSixNations2027Html,
  SIX_NATIONS_2027_COMPETITION_SLUG,
  WIKIPEDIA_SIX_NATIONS_2027_SOURCE,
  WIKIPEDIA_SIX_NATIONS_2027_URL,
} from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import { upsertMatches } from "@/lib/ingestion/upsert";
import { fetchWithPolicy, saveRawData } from "@/lib/scrapers";
import { buildMatchWikipediaUrl, scrapeMatchEvents } from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import type { ResolvedMatchCandidate } from "@/lib/ingestion/upsert";

type TeamLookup = Record<string, string>;
type ResolvedResultMatch = ResolvedMatchCandidate & {
  awayTeamName: string;
  homeTeamName: string;
  rawHtml: string;
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

async function getCompetition() {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id, season")
    .eq("slug", SIX_NATIONS_2027_COMPETITION_SLUG)
    .single();

  if (error) {
    throw error;
  }

  return data;
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
): ResolvedResultMatch[] {
  return parsedMatches.flatMap((match) => {
    const homeTeamId = teamLookup[match.homeTeamName];
    const awayTeamId = teamLookup[match.awayTeamName];

    if (!homeTeamId || !awayTeamId) {
      console.warn(
        `Skipping Wikipedia result because a team is missing from seed data: ${match.homeTeamName} vs ${match.awayTeamName}`,
      );

      return [];
    }

    return [
      {
        awayScore: match.awayScore,
        awayTeamId,
        awayTeamName: match.awayTeamName,
        competitionId,
        externalIds: toExternalIds(match),
        homeScore: match.homeScore,
        homeTeamId,
        homeTeamName: match.homeTeamName,
        kickoffAt: match.kickoffAt,
        rawHtml: match.rawHtml,
        status: match.status,
        venue: match.venue,
      },
    ];
  });
}

export async function ingestSixNations2027Results() {
  const response = await fetchWithPolicy(WIKIPEDIA_SIX_NATIONS_2027_URL);
  const html = await response.text();
  const parsedMatches = parseWikipediaSixNations2027Html(html);
  const competition = await getCompetition();
  const teamLookup = await getTeamLookup(
    parsedMatches.flatMap((match) => [match.homeTeamName, match.awayTeamName]),
  );
  const resolvedMatches = resolveParsedMatches(
    parsedMatches,
    competition.id,
    teamLookup,
  );
  const result = await upsertMatches(resolvedMatches, {
    insertMissing: false,
  });

  await Promise.all(
    result.records.map((record) =>
      saveRawData({
        matchId: record.id,
        payload: {
          external_ids: record.externalIds,
          html: resolvedMatches[record.candidateIndex]?.rawHtml ?? "",
        },
        source: WIKIPEDIA_SIX_NATIONS_2027_SOURCE,
        sourceUrl: WIKIPEDIA_SIX_NATIONS_2027_URL,
      }),
    ),
  );

  let eventsInserted = 0;
  const newlyFinishedMatches = result.records.filter(
    (record) => record.statusChangedToFinished,
  );

  for (const record of newlyFinishedMatches) {
    const match = resolvedMatches[record.candidateIndex];

    if (!match) {
      continue;
    }

    const matchUrl = buildMatchWikipediaUrl({
      awayTeamName: match.awayTeamName,
      homeTeamName: match.homeTeamName,
      year: competition.season,
    });
    const events = await scrapeMatchEvents(matchUrl);
    const upsertedEvents = await upsertMatchEvents({
      awayTeamId: match.awayTeamId,
      events,
      homeTeamId: match.homeTeamId,
      matchId: record.id,
    });

    eventsInserted += upsertedEvents.inserted;
  }

  console.info(
    `Ingested Six Nations 2027 results: updated=${result.matchesUpdated} events_inserted=${eventsInserted}`,
  );

  return {
    competition: SIX_NATIONS_2027_COMPETITION_SLUG,
    counts: {
      events_inserted: eventsInserted,
      matches_inserted: result.matchesInserted,
      matches_updated: result.matchesUpdated,
      raw_data_rows: result.records.length,
    },
  };
}
