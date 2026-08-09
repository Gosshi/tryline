import { load } from "cheerio";

import {
  buildUtcIsoString,
  clearFutureZeroScores,
  isMissingWikipediaPage,
  normalizeWhitespace,
  parseDmyDate,
  parseScoreText,
} from "@/lib/ingestion/sources/live-source-utils";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const PLAYOFF_ROUNDS: Record<string, number> = {
  "Relegation_play-off": 0,
  "Semi-final_Qualifiers": 1,
  "Semi-finals": 2,
  Final: 3,
};
const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bayonne: "bayonne",
  "Bordeaux Bègles": "bordeaux-begles",
  Castres: "castres",
  Clermont: "clermont",
  Grenoble: "grenoble",
  "La Rochelle": "la-rochelle",
  Lyon: "lyon",
  Montpellier: "montpellier",
  Pau: "pau",
  Perpignan: "perpignan",
  Racing: "racing-92",
  "Racing 92": "racing-92",
  "Stade Français": "stade-francais",
  Toulon: "toulon",
  Toulouse: "toulouse",
  Vannes: "vannes",
};

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

function parseKickoffText(value: string) {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(
    /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})/,
  );

  if (!matched) {
    throw new Error(`Unable to locate Top 14 kickoff text: ${normalized}`);
  }

  const dateText = matched[1]!;
  const timeText = matched[2]!;
  const parsedDate = parseDmyDate(dateText);
  const [hoursText = "00", minutesText = "00"] = timeText.split(":");
  const localDateAsUtc = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      Number(hoursText),
      Number(minutesText),
    ),
  );

  return buildUtcIsoString({
    dateText,
    offsetHours: isCentralEuropeanSummerTime(localDateAsUtc) ? 2 : 1,
    timeText,
  });
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

function resolveRound(sectionId: string | null) {
  if (sectionId === null) {
    return undefined;
  }

  const playoffRound = PLAYOFF_ROUNDS[sectionId];

  if (playoffRound !== undefined) {
    return playoffRound;
  }

  const matched = sectionId.match(ROUND_ID_PATTERN);

  return matched?.[1] !== undefined ? Number(matched[1]) : undefined;
}

export function parseTop14LiveHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const $ = load(html);
  const results: ParsedLiveMatch[] = [];

  for (const element of $("div.vevent.summary").toArray()) {
    const block = $(element);
    const sectionId = getSectionId($, block);
    const round = resolveRound(sectionId);

    if (round === undefined) {
      continue;
    }

    const tables = block.find("table");
    const dateTable = tables.eq(0);
    const matchupTable = tables.eq(1);
    const venueTable = tables.eq(2);
    const firstRowCells = matchupTable.find("tr").first().find("td");
    const score = parseScoreText(firstRowCells.eq(1).text());
    const homeTeamName = normalizeWhitespace(
      firstRowCells.eq(0).find("a").last().text(),
    );
    const awayTeamName = normalizeWhitespace(
      firstRowCells.eq(2).find("a").last().text(),
    );
    const homeTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[homeTeamName];
    const awayTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[awayTeamName];

    if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) {
      console.warn(
        `Skipping live match with unknown team: ${homeTeamName} vs ${awayTeamName}`,
      );
      continue;
    }

    results.push({
      awayScore: score.awayScore,
      awayTeamName,
      awayTeamSlug,
      eventId:
        block.attr("id") ??
        `${sectionId}_${homeTeamName.replace(/\s+/g, "_")}_v_${awayTeamName.replace(/\s+/g, "_")}`,
      homeScore: score.homeScore,
      homeTeamName,
      homeTeamSlug,
      kickoffAt: parseKickoffText(dateTable.text()),
      lineupTableHtml: null,
      rawHtml: $.html(block),
      round,
      roundName: null,
      status: score.status,
      venue:
        normalizeWhitespace(venueTable.find(".location").first().text()) ||
        null,
      wikipediaUrl,
    });
  }

  return results;
}

export async function fetchTop14(season: string): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl(season);

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return clearFutureZeroScores(
      parseTop14LiveHtml(await response.text(), sourceUrl),
    );
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
