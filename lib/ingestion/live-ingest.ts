import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertMatchEvents } from "@/lib/ingestion/events";
import { reconcilePhantomNullMinuteScoringEvents } from "@/lib/ingestion/reconcile-phantom-events";
import { upsertMatches } from "@/lib/ingestion/upsert";
import { saveRawData } from "@/lib/scrapers";
import {
  parseMatchEventsFromUrcDetailRowHtml,
  parseMatchEventsFromVeventHtml,
} from "@/lib/scrapers/wikipedia-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

export type LiveCompetitionSource = {
  competitionName: string;
  competitionNameJa?: string;
  competitionSlug: string;
  family: string;
  fetch: () => Promise<ParsedLiveMatch[]>;
  fetchEventMatches?: () => Promise<ParsedLiveMatch[]>;
  season: string;
  sourceLabel: string;
};

export type LiveIngestResult = {
  competition: string;
  counts: {
    events_inserted: number;
    matches_inserted: number;
    matches_updated: number;
  };
};

type TeamLookup = {
  byName: Record<string, string>;
  bySlug: Record<string, string>;
};

async function upsertCompetition(
  source: LiveCompetitionSource,
  matches: ParsedLiveMatch[],
): Promise<string> {
  const client = getSupabaseServerClient();
  const dates = matches
    .map((match) => match.kickoffAt.slice(0, 10))
    .sort((left, right) => left.localeCompare(right));
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: dates.at(-1) ?? null,
        family: source.family,
        name: source.competitionName,
        ...(source.competitionNameJa
          ? { name_ja: source.competitionNameJa }
          : {}),
        season: source.season,
        slug: source.competitionSlug,
        start_date: dates[0] ?? null,
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

async function getTeamLookup(matches: ParsedLiveMatch[]): Promise<TeamLookup> {
  const client = getSupabaseServerClient();
  const names = matches.flatMap((match) => [
    match.homeTeamName,
    match.awayTeamName,
  ]);
  const slugs = matches.flatMap((match) => [
    match.homeTeamSlug,
    match.awayTeamSlug,
  ]);
  const uniqueNames = [...new Set(names.filter(isPresentString))];
  const uniqueSlugs = [...new Set(slugs.filter(isPresentString))];

  if (uniqueNames.length === 0 && uniqueSlugs.length === 0) {
    return { byName: {}, bySlug: {} };
  }

  const rows: Array<{ id: string; name: string; slug: string }> = [];

  if (uniqueNames.length > 0) {
    const { data, error } = await client
      .from("teams")
      .select("id, name, slug")
      .in("name", uniqueNames);

    if (error) {
      throw error;
    }

    rows.push(...data);
  }

  if (uniqueSlugs.length > 0) {
    const { data, error } = await client
      .from("teams")
      .select("id, name, slug")
      .in("slug", uniqueSlugs);

    if (error) {
      throw error;
    }

    rows.push(...data);
  }

  const uniqueRows = [...new Map(rows.map((team) => [team.id, team])).values()];

  return {
    byName: Object.fromEntries(uniqueRows.map((team) => [team.name, team.id])),
    bySlug: Object.fromEntries(uniqueRows.map((team) => [team.slug, team.id])),
  };
}

function isPresentString(value: string | undefined): value is string {
  return Boolean(value);
}

function toExternalIds(
  source: LiveCompetitionSource,
  match: ParsedLiveMatch,
): Record<string, Json> {
  const externalIds: Record<string, Json> = {
    source: source.sourceLabel,
  };

  if (match.eventId) {
    externalIds.wikipedia_event_id = match.eventId;
  }

  if (match.wikipediaUrl) {
    externalIds.wikipedia_url = match.wikipediaUrl;
  }

  if (match.round !== null && match.round !== undefined) {
    externalIds.wikipedia_round = match.round;
  }

  if (match.roundName) {
    externalIds.round_name = match.roundName;
  }

  return externalIds;
}

function dropReconciledPhantomEventsForTeam(params: {
  actualScore: number | null;
  events: ParsedMatchEvent[];
  matchId: string;
  teamSide: "away" | "home";
}): ParsedMatchEvent[] {
  const teamEvents = params.events.filter(
    (event) => event.teamSide === params.teamSide,
  );
  const reconciliation = reconcilePhantomNullMinuteScoringEvents(
    teamEvents,
    params.actualScore,
  );

  if (reconciliation.status !== "reconciled") {
    return params.events;
  }

  const remove = new Set<ParsedMatchEvent>(reconciliation.remove);
  console.warn("[phantom-events] dropped", {
    count: remove.size,
    matchId: params.matchId,
  });

  return params.events.filter((event) => !remove.has(event));
}

export function dropReconciledPhantomEvents(params: {
  awayScore: number | null;
  events: ParsedMatchEvent[];
  homeScore: number | null;
  matchId: string;
}): ParsedMatchEvent[] {
  const withoutHomePhantoms = dropReconciledPhantomEventsForTeam({
    actualScore: params.homeScore,
    events: params.events,
    matchId: params.matchId,
    teamSide: "home",
  });

  return dropReconciledPhantomEventsForTeam({
    actualScore: params.awayScore,
    events: withoutHomePhantoms,
    matchId: params.matchId,
    teamSide: "away",
  });
}

function parseLiveMatchEvents(
  source: LiveCompetitionSource,
  rawHtml: string,
): ParsedMatchEvent[] {
  if (source.family === "urc") {
    return parseMatchEventsFromUrcDetailRowHtml(rawHtml);
  }

  return parseMatchEventsFromVeventHtml(rawHtml);
}

function buildParsedMatchKey(match: ParsedLiveMatch | undefined) {
  if (!match) {
    return null;
  }

  const homeKey = match.homeTeamSlug ?? match.homeTeamName;
  const awayKey = match.awayTeamSlug ?? match.awayTeamName;

  return `${homeKey}:${awayKey}`;
}

export async function ingestLiveCompetition(
  source: LiveCompetitionSource,
): Promise<LiveIngestResult> {
  const parsedMatches = await source.fetch();
  const eventMatchByKey = new Map<string, ParsedLiveMatch>();

  if (source.fetchEventMatches) {
    const eventMatches = await source.fetchEventMatches();

    for (const eventMatch of eventMatches) {
      const key = buildParsedMatchKey(eventMatch);

      if (key) {
        eventMatchByKey.set(key, eventMatch);
      }
    }
  }

  const competitionId = await upsertCompetition(source, parsedMatches);

  if (parsedMatches.length === 0) {
    console.warn(`No matches found for ${source.competitionSlug}`);

    return {
      competition: source.competitionSlug,
      counts: { events_inserted: 0, matches_inserted: 0, matches_updated: 0 },
    };
  }

  const teamLookup = await getTeamLookup(parsedMatches);
  const resolvedMatches = parsedMatches.flatMap((match) => {
    const homeTeamId =
      (match.homeTeamSlug ? teamLookup.bySlug[match.homeTeamSlug] : null) ??
      teamLookup.byName[match.homeTeamName];
    const awayTeamId =
      (match.awayTeamSlug ? teamLookup.bySlug[match.awayTeamSlug] : null) ??
      teamLookup.byName[match.awayTeamName];

    if (!homeTeamId || !awayTeamId) {
      console.warn(
        `Skipping unknown team: ${match.homeTeamName} vs ${match.awayTeamName}`,
      );
      return [];
    }

    return [
      {
        awayScore: match.awayScore,
        awayTeamId,
        competitionId,
        externalIds: toExternalIds(source, match),
        homeScore: match.homeScore,
        homeTeamId,
        kickoffAt: match.kickoffAt,
        rawHtml: match.rawHtml,
        status: match.status,
        venue: match.venue,
      },
    ];
  });
  const result = await upsertMatches(resolvedMatches);

  await Promise.all(
    result.records.map((record) =>
      saveRawData({
        matchId: record.id,
        payload: {
          external_ids: record.externalIds,
          html: resolvedMatches[record.candidateIndex]?.rawHtml ?? "",
        },
        source: source.sourceLabel,
        sourceUrl: source.competitionSlug,
      }),
    ),
  );

  let eventsInserted = 0;
  const newlyFinishedMatches = result.records.filter(
    (record) => record.statusChangedToFinished,
  );

  for (const record of newlyFinishedMatches) {
    const match = resolvedMatches[record.candidateIndex];
    const parsedMatch = parsedMatches[record.candidateIndex];
    const eventMatch =
      eventMatchByKey.get(buildParsedMatchKey(parsedMatch) ?? "") ?? null;
    const rawHtml = eventMatch?.rawHtml ?? match?.rawHtml;

    if (!match || !rawHtml) {
      continue;
    }

    try {
      const parsedEvents = parseLiveMatchEvents(source, rawHtml);
      const events = dropReconciledPhantomEvents({
        awayScore: match.awayScore,
        events: parsedEvents,
        homeScore: match.homeScore,
        matchId: record.id,
      });

      if (events.length > 0) {
        const upserted = await upsertMatchEvents({
          awayTeamId: match.awayTeamId,
          events,
          homeTeamId: match.homeTeamId,
          matchId: record.id,
        });
        eventsInserted += upserted.inserted;
      }
    } catch (error) {
      console.warn(
        `[${source.competitionSlug}] event parse failed for match ${record.id}:`,
        error,
      );
    }
  }

  console.info(
    `[${source.competitionSlug}] inserted=${result.matchesInserted} updated=${result.matchesUpdated} events_inserted=${eventsInserted}`,
  );

  return {
    competition: source.competitionSlug,
    counts: {
      events_inserted: eventsInserted,
      matches_inserted: result.matchesInserted,
      matches_updated: result.matchesUpdated,
    },
  };
}
