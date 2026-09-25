import {
  parseInternationalFixturesWithScores,
  type InternationalFixtureResult,
} from "@/lib/audit/missing-internationals";
import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { parseScoreText } from "@/lib/ingestion/sources/live-source-utils";
import { fetchWikipediaWikitext } from "@/lib/ingestion/sources/wikipedia-wikitext";
import { findEventBlockByTeams } from "@/lib/ingestion/wikipedia-event-block";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { Database, Json } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MIN_MATCH_AGE_MS = 2 * 60 * 60 * 1_000;
const MAX_MATCH_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

type Team = {
  english_name: string | null;
  name: string;
  short_code: string | null;
};

type ManualMatch = {
  away_score: number | null;
  away_team: Team | null;
  away_team_id: string;
  external_ids: Json;
  home_score: number | null;
  home_team: Team | null;
  home_team_id: string;
  id: string;
  kickoff_at: string;
};

type SkippedMatch = { matchId: string; reason: string };

export type ManualInternationalResultsResult = {
  candidates: number;
  eventRetryCandidates: number;
  eventsInserted: number;
  scoresUpdated: number;
  skipped: SkippedMatch[];
};

type Options = {
  client?: SupabaseClient<Database>;
  fetchHtml?: (url: string) => Promise<string>;
  fetchWikitext?: (pageTitle: string) => Promise<string>;
  now?: Date;
};

function toExternalIds(value: Json, pageUrl: string): Json {
  const existing =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  return {
    ...existing,
    result_source: "wikipedia-internationals",
    wikipedia_url: pageUrl,
  };
}

function getFixtureDateDistance(
  match: ManualMatch,
  fixture: InternationalFixtureResult,
) {
  const kickoffDay = Date.parse(
    `${match.kickoff_at.slice(0, 10)}T00:00:00.000Z`,
  );
  const fixtureDay = Date.parse(`${fixture.date}T00:00:00.000Z`);

  return Math.abs(kickoffDay - fixtureDay) / (24 * 60 * 60 * 1_000);
}

function fixturesForMatch(
  match: ManualMatch,
  fixtures: InternationalFixtureResult[],
) {
  const matchingDate = fixtures.filter(
    (fixture) => fixture.date && getFixtureDateDistance(match, fixture) <= 1,
  );
  const homeCode = match.home_team?.short_code?.toUpperCase();
  const awayCode = match.away_team?.short_code?.toUpperCase();

  return {
    ordered: matchingDate.filter(
      (fixture) =>
        fixture.homeCode === homeCode && fixture.awayCode === awayCode,
    ),
    reversed: matchingDate.filter(
      (fixture) =>
        fixture.homeCode === awayCode && fixture.awayCode === homeCode,
    ),
  };
}

async function defaultFetchHtml(url: string) {
  const response = await fetchWithPolicy(url);
  return response.text();
}

async function hasEvents(client: SupabaseClient<Database>, matchId: string) {
  const { count, error } = await client
    .from("match_events")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function applyManualInternationalResults(
  options: Options = {},
): Promise<ManualInternationalResultsResult> {
  const client = options.client ?? getSupabaseServerClient();
  const now = options.now ?? new Date();
  const earliestKickoff = new Date(
    now.getTime() - MAX_MATCH_AGE_MS,
  ).toISOString();
  const latestKickoff = new Date(
    now.getTime() - MIN_MATCH_AGE_MS,
  ).toISOString();
  const { data, error } = await client
    .from("matches")
    .select(
      "id, kickoff_at, home_team_id, away_team_id, home_score, away_score, external_ids, home_team:teams!matches_home_team_id_fkey(short_code, english_name, name), away_team:teams!matches_away_team_id_fkey(short_code, english_name, name)",
    )
    .eq("external_ids->>source", "manual")
    .gte("kickoff_at", earliestKickoff)
    .lte("kickoff_at", latestKickoff);

  if (error) throw error;

  const recentManualMatches = (data ?? []) as unknown as ManualMatch[];
  const scoreCandidates = recentManualMatches.filter(
    (match) => match.home_score === null && match.away_score === null,
  );
  const possibleEventRetryMatches = recentManualMatches.filter(
    (match) =>
      match.home_score !== null &&
      match.away_score !== null &&
      match.external_ids !== null &&
      typeof match.external_ids === "object" &&
      !Array.isArray(match.external_ids) &&
      match.external_ids.result_source === "wikipedia-internationals",
  );
  const eventRetryCandidates: ManualMatch[] = [];
  for (const match of possibleEventRetryMatches) {
    if (!(await hasEvents(client, match.id))) {
      eventRetryCandidates.push(match);
    }
  }

  const result: ManualInternationalResultsResult = {
    candidates: scoreCandidates.length,
    eventRetryCandidates: eventRetryCandidates.length,
    eventsInserted: 0,
    scoresUpdated: 0,
    skipped: [],
  };
  if (scoreCandidates.length === 0 && eventRetryCandidates.length === 0) {
    return result;
  }

  const fixturesByYear = new Map<number, InternationalFixtureResult[]>();
  const pageUrlByYear = new Map<number, string>();
  const years = [
    ...new Set(
      scoreCandidates.map((match) => new Date(match.kickoff_at).getUTCFullYear()),
    ),
  ];

  for (const year of years) {
    const pageTitle = `${year} men's rugby union internationals`;
    const pageUrl = `https://en.wikipedia.org/wiki/${year}_men%27s_rugby_union_internationals`;
    pageUrlByYear.set(year, pageUrl);

    try {
      const wikitext = options.fetchWikitext
        ? await options.fetchWikitext(pageTitle)
        : await fetchWikipediaWikitext([pageTitle]);
      fixturesByYear.set(
        year,
        parseInternationalFixturesWithScores(wikitext, pageTitle),
      );
    } catch (fetchError) {
      if (
        fetchError instanceof Error &&
        "status" in fetchError &&
        fetchError.status === 404
      ) {
        fixturesByYear.set(year, []);
        continue;
      }
      throw fetchError;
    }
  }

  const matchesWithScores: Array<{
    awayScore: number;
    homeScore: number;
    match: ManualMatch;
    pageUrl: string;
  }> = [];

  for (const match of scoreCandidates) {
    const year = new Date(match.kickoff_at).getUTCFullYear();
    const fixtures = fixturesByYear.get(year) ?? [];
    const { ordered, reversed } = fixturesForMatch(match, fixtures);

    if (ordered.length > 1) {
      result.skipped.push({ matchId: match.id, reason: "ambiguous_rugbybox" });
      continue;
    }
    if (ordered.length === 0) {
      result.skipped.push({
        matchId: match.id,
        reason: reversed.length > 0 ? "home_away_reversed" : "no_rugbybox",
      });
      continue;
    }

    const fixture = ordered[0]!;
    const score = parseScoreText(fixture.score);
    if (score.homeScore === null || score.awayScore === null) {
      result.skipped.push({ matchId: match.id, reason: "score_not_published" });
      continue;
    }

    matchesWithScores.push({
      awayScore: score.awayScore,
      homeScore: score.homeScore,
      match,
      pageUrl: pageUrlByYear.get(year)!,
    });
  }

  const htmlByYear = new Map<number, string>();
  const insertEvents = async (match: ManualMatch, pageUrl: string) => {
    // Recheck before inserting to avoid replacing events added after candidate selection.
    if (await hasEvents(client, match.id)) return;

    const year = new Date(match.kickoff_at).getUTCFullYear();
    let html = htmlByYear.get(year);
    if (html === undefined) {
      html = await (options.fetchHtml ?? defaultFetchHtml)(pageUrl);
      htmlByYear.set(year, html);
    }
    const eventBlock = findEventBlockByTeams(
      html,
      match.home_team?.english_name || match.home_team?.name || "",
      match.away_team?.english_name || match.away_team?.name || "",
      match.kickoff_at.slice(0, 10),
    );

    if (eventBlock === null) {
      result.skipped.push({
        matchId: match.id,
        reason: "no_unique_event_block",
      });
      return;
    }

    const events = parseMatchEventsFromVeventHtml(eventBlock);
    const eventResult = await upsertMatchEvents({
      awayTeamId: match.away_team_id,
      events,
      homeTeamId: match.home_team_id,
      matchId: match.id,
    });

    if (
      eventResult.rejected.some(
        (rejection) => rejection.reason === "score_mismatch",
      )
    ) {
      result.skipped.push({
        matchId: match.id,
        reason: "event_total_mismatch",
      });
      return;
    }
    if (eventResult.rejected.length > 0) {
      result.skipped.push({
        matchId: match.id,
        reason: eventResult.rejected
          .map((rejection) => rejection.reason)
          .join(","),
      });
      return;
    }
    result.eventsInserted += eventResult.inserted;
  };

  for (const { awayScore, homeScore, match, pageUrl } of matchesWithScores) {
    const { error: updateError } = await client
      .from("matches")
      .update({
        away_score: awayScore,
        external_ids: toExternalIds(match.external_ids, pageUrl),
        home_score: homeScore,
        status: "finished",
      })
      .eq("id", match.id);

    if (updateError) throw updateError;
    result.scoresUpdated += 1;
    await insertEvents(match, pageUrl);
  }

  for (const match of eventRetryCandidates) {
    const year = new Date(match.kickoff_at).getUTCFullYear();
    const pageUrl =
      `https://en.wikipedia.org/wiki/${year}_men%27s_rugby_union_internationals`;
    await insertEvents(match, pageUrl);
  }

  return result;
}
