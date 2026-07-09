import { load } from "cheerio";

import {
  buildUtcIsoString,
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  normalizeWhitespace,
  parseScoreText,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchNationsChampionship2026KickoffTimes } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { ParsedWikipediaMatch } from "@/lib/ingestion/sources/wikipedia-six-nations";
import type { WorldRugbyNationsChampionshipTime } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  "New Zealand": "new-zealand",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Wales: "wales",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Nations_Championship`;
}

function slugifyEventPart(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseRoundNumber(value: string) {
  const matched = normalizeWhitespace(value).match(/^Round\s+(\d+)$/i);

  return matched?.[1] ? Number(matched[1]) : null;
}

function parseRoundTableMatches(
  html: string,
  wikipediaUrl: string | null,
): ParsedWikipediaMatch[] {
  const $ = load(html);
  const matches: ParsedWikipediaMatch[] = [];

  for (const heading of $("div.mw-heading").toArray()) {
    const roundName = normalizeWhitespace($(heading).text()).replace(
      /\[edit\]$/i,
      "",
    );
    const round = parseRoundNumber(roundName);

    if (!round) {
      continue;
    }

    let cursor = $(heading).next();

    while (cursor.length > 0 && !cursor.is("div.mw-heading")) {
      if (cursor.is("table")) {
        cursor.find("tr").each((index, row) => {
          if (index === 0) {
            return;
          }

          const cells = $(row).find("th, td");

          if (cells.length < 5) {
            return;
          }

          const dateText = normalizeWhitespace(cells.eq(0).text());
          const homeTeamName = normalizeWhitespace(cells.eq(1).text());
          const score = parseScoreText(cells.eq(2).text());
          const awayTeamName = normalizeWhitespace(cells.eq(3).text());
          const venue = normalizeWhitespace(cells.eq(4).text()) || null;

          if (!dateText || !homeTeamName || !awayTeamName) {
            return;
          }

          matches.push({
            awayScore: score.awayScore,
            awayTeamName,
            eventId: [
              `round_${round}`,
              slugifyEventPart(homeTeamName),
              "v",
              slugifyEventPart(awayTeamName),
            ].join("_"),
            homeScore: score.homeScore,
            homeTeamName,
            kickoffAt: buildUtcIsoString({ dateText }),
            lineupTableHtml: null,
            rawHtml: $.html(row),
            round,
            roundName: null,
            status: score.status,
            venue,
            wikipediaUrl,
          });
        });
      }

      cursor = cursor.next();
    }
  }

  return matches;
}

function parseFinalsMatches(
  html: string,
  wikipediaUrl: string | null,
): ParsedWikipediaMatch[] {
  return toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );
}

export function parseNationsChampionshipLiveHtml(
  html: string,
  kickoffTimes: WorldRugbyNationsChampionshipTime[] = [],
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = [
    ...parseRoundTableMatches(html, wikipediaUrl),
    ...parseFinalsMatches(html, wikipediaUrl),
  ];
  const kickoffTimeByTeams = new Map(
    kickoffTimes.map((match) => [
      `${match.homeTeamSlug}:${match.awayTeamSlug}`,
      match,
    ]),
  );
  const resolvedMatches = mapWithTeamSlugs(
    parsedMatches,
    TEAM_SLUG_BY_WIKIPEDIA_NAME,
  );

  return resolvedMatches.map((match) => {
    const kickoffTime = kickoffTimeByTeams.get(
      `${match.homeTeamSlug}:${match.awayTeamSlug}`,
    );

    if (!kickoffTime) {
      return match;
    }

    return {
      ...match,
      kickoffAt: kickoffTime.kickoffAt,
      round: kickoffTime.round,
      venue: kickoffTime.venue ?? match.venue,
    };
  });
}

export async function fetchNationsChampionship2026(): Promise<
  ParsedLiveMatch[]
> {
  const sourceUrl = buildWikipediaUrl("2026");

  try {
    const [response, kickoffTimes] = await Promise.all([
      fetchWithPolicy(sourceUrl),
      fetchNationsChampionship2026KickoffTimes(),
    ]);

    return parseNationsChampionshipLiveHtml(
      await response.text(),
      kickoffTimes,
      sourceUrl,
    );
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
