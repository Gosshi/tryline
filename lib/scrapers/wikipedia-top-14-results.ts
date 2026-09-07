import { load } from "cheerio";
import { parse } from "date-fns";

import { resolveTop14TeamSlug } from "@/lib/ingestion/sources/top-14-team-slugs";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type HistoricalMatchResult = {
  season: string;
  round: number | null;
  kickoff_at: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  source_url: string;
  wikipedia_event_id: string | null;
};

export type SkippedTop14Result = {
  awayTeamName: string;
  homeTeamName: string;
  round: number;
  unknownTeamNames: string[];
  wikipediaEventId: string | null;
};

export type Top14ResultsParseResult = {
  results: HistoricalMatchResult[];
  skippedMatchCount: number;
  skippedMatches: SkippedTop14Result[];
  unknownTeamNames: string[];
};

export interface CompetitionResultScraper {
  fetchResults(season: string): Promise<Top14ResultsParseResult>;
}

const SCORE_PATTERN = /(\d+)\s*[–-]\s*(\d+)/;
const SECTION_ROUNDS: Record<string, number> = {
  "Relegation_play-off": 0,
  "Semi-final_Qualifiers": 1,
  "Semi-finals": 2,
  Final: 3,
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseSeason(season: string) {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`Top 14 season must be YYYY-YY: ${season}`);
  }

  return season;
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Top_14_season`;
}

function lastSundayOfMonthUtc(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return date;
}

function isCentralEuropeanSummerTime(date: Date) {
  const year = date.getUTCFullYear();
  const startsAt = lastSundayOfMonthUtc(year, 2);
  startsAt.setUTCHours(1, 0, 0, 0);

  const endsAt = lastSundayOfMonthUtc(year, 9);
  endsAt.setUTCHours(1, 0, 0, 0);

  return date >= startsAt && date < endsAt;
}

function parseKickoffAt(dateText: string, timeText: string) {
  const parsedDate = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse Top 14 fixture date: ${dateText}`);
  }

  const [hoursText, minutesText] = timeText.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Unable to parse Top 14 fixture time: ${timeText}`);
  }

  const localDateAsUtc = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours,
      minutes,
    ),
  );
  const timezoneOffset = isCentralEuropeanSummerTime(localDateAsUtc) ? 2 : 1;

  return new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours - timezoneOffset,
      minutes,
    ),
  ).toISOString();
}

function parseScore(scoreText: string) {
  const matched = normalizeWhitespace(scoreText).match(SCORE_PATTERN);

  if (!matched) {
    return null;
  }

  return {
    awayScore: Number(matched[2]),
    homeScore: Number(matched[1]),
  };
}

function parseKickoffText(value: string) {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(
    /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})/,
  );

  if (!matched) {
    throw new Error(`Unable to locate Top 14 kickoff text: ${normalized}`);
  }

  return parseKickoffAt(matched[1]!, matched[2]!);
}

function getSectionId(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
) {
  let cursor = block.prev();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading")) {
      return cursor.find("h2, h3").attr("id") ?? null;
    }

    cursor = cursor.prev();
  }

  return null;
}

export function parseTop14ResultsHtml(
  html: string,
  season: string,
  sourceUrl = buildWikipediaUrl(season),
): Top14ResultsParseResult {
  const parsedSeason = parseSeason(season);
  const $ = load(html);
  const results: HistoricalMatchResult[] = [];
  const skippedMatches: SkippedTop14Result[] = [];

  for (const element of $("div.vevent.summary").toArray()) {
    const block = $(element);
    const sectionId = getSectionId($, block);
    const round =
      sectionId === null ? undefined : (SECTION_ROUNDS[sectionId] ?? undefined);

    if (round === undefined) {
      continue;
    }

    const tables = block.find("table");
    const dateTable = tables.eq(0);
    const matchupTable = tables.eq(1);
    const venueTable = tables.eq(2);
    const firstRowCells = matchupTable.find("tr").first().find("td");
    const score = parseScore(firstRowCells.eq(1).text());

    if (!score) {
      continue;
    }

    const homeTeamName = normalizeWhitespace(
      firstRowCells.eq(0).find("a").last().text(),
    );
    const awayTeamName = normalizeWhitespace(
      firstRowCells.eq(2).find("a").last().text(),
    );

    if (!homeTeamName || !awayTeamName) {
      throw new Error("Unable to parse Top 14 team names from a vevent block.");
    }

    const homeTeamSlug = resolveTop14TeamSlug(homeTeamName);
    const awayTeamSlug = resolveTop14TeamSlug(awayTeamName);

    if (!homeTeamSlug || !awayTeamSlug) {
      skippedMatches.push({
        awayTeamName,
        homeTeamName,
        round,
        unknownTeamNames: [
          ...(!homeTeamSlug ? [homeTeamName] : []),
          ...(!awayTeamSlug ? [awayTeamName] : []),
        ],
        wikipediaEventId: block.attr("id") ?? null,
      });
      continue;
    }

    results.push({
      away_score: score.awayScore,
      away_team_slug: awayTeamSlug,
      home_score: score.homeScore,
      home_team_slug: homeTeamSlug,
      kickoff_at: parseKickoffText(dateTable.text()),
      round,
      season: parsedSeason,
      source_url: sourceUrl,
      venue:
        normalizeWhitespace(venueTable.find(".location").first().text()) ||
        null,
      wikipedia_event_id:
        block.attr("id") ??
        `${sectionId}_${homeTeamName.replace(/\s+/g, "_")}_v_${awayTeamName.replace(/\s+/g, "_")}`,
    });
  }

  if (results.length === 0 && skippedMatches.length === 0) {
    throw new Error("No finished Top 14 playoff matches were found.");
  }

  return {
    results,
    skippedMatchCount: skippedMatches.length,
    skippedMatches,
    unknownTeamNames: [
      ...new Set(skippedMatches.flatMap((match) => match.unknownTeamNames)),
    ],
  };
}

export const wikipediaTop14ResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parseTop14ResultsHtml(html, season, sourceUrl);
  },
};
