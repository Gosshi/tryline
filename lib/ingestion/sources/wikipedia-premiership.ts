import { load } from "cheerio";

import {
  buildUtcIsoString,
  isMissingWikipediaPage,
  normalizeWhitespace,
  parseDmyDate,
  parseScoreText,
} from "@/lib/ingestion/sources/live-source-utils";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bath: "bath",
  "Bath Rugby": "bath",
  Bristol: "bristol-bears",
  "Bristol Bears": "bristol-bears",
  Exeter: "exeter-chiefs",
  "Exeter Chiefs": "exeter-chiefs",
  Gloucester: "gloucester",
  "Gloucester Rugby": "gloucester",
  Harlequins: "harlequins",
  Leicester: "leicester-tigers",
  "Leicester Tigers": "leicester-tigers",
  Newcastle: "newcastle-falcons",
  "Newcastle Falcons": "newcastle-falcons",
  Northampton: "northampton-saints",
  "Northampton Saints": "northampton-saints",
  Sale: "sale-sharks",
  "Sale Sharks": "sale-sharks",
  Saracens: "saracens",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Premiership_Rugby`;
}

function lastSundayOfMonthUtc(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return date;
}

function isBritishSummerTime(date: Date) {
  const year = date.getUTCFullYear();
  const startsAt = lastSundayOfMonthUtc(year, 2);
  startsAt.setUTCHours(1, 0, 0, 0);

  const endsAt = lastSundayOfMonthUtc(year, 9);
  endsAt.setUTCHours(1, 0, 0, 0);

  return date >= startsAt && date < endsAt;
}

function parseKickoffAt(value: string) {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(
    /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})/,
  );

  if (!matched) {
    throw new Error(`Unable to locate Premiership kickoff text: ${normalized}`);
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
    offsetHours: isBritishSummerTime(localDateAsUtc) ? 1 : 0,
    timeText,
  });
}

function parseRoundFromHeading(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
) {
  let cursor = block.prev();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading")) {
      const h3 = cursor.find("h3").first();
      const h2 = cursor.find("h2").first();
      const matched = h3.attr("id")?.match(ROUND_ID_PATTERN);

      if (matched) {
        return Number(matched[1]);
      }

      if (h2.length > 0) {
        return null;
      }
    }

    cursor = cursor.prev();
  }

  return null;
}

function isWithinRegularSeason(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
) {
  let cursor = block.prev();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading") && cursor.find("h2").length > 0) {
      return cursor.find("h2").attr("id") === "Regular_season";
    }

    cursor = cursor.prev();
  }

  return false;
}

export function parsePremiershipLiveHtml(html: string): ParsedLiveMatch[] {
  const $ = load(html);
  const results: ParsedLiveMatch[] = [];

  for (const element of $("div.vevent.summary").toArray()) {
    const block = $(element);

    if (!isWithinRegularSeason($, block)) {
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
      continue;
    }

    results.push({
      awayScore: score.awayScore,
      awayTeamName,
      awayTeamSlug,
      eventId: block.attr("id") ?? null,
      homeScore: score.homeScore,
      homeTeamName,
      homeTeamSlug,
      kickoffAt: parseKickoffAt(dateTable.text()),
      lineupTableHtml: null,
      rawHtml: $.html(block),
      round: parseRoundFromHeading($, block),
      status: score.status,
      venue:
        normalizeWhitespace(venueTable.find(".location").first().text()) ||
        null,
    });
  }

  return results;
}

export async function fetchPremiership202526(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2025-26");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parsePremiershipLiveHtml(await response.text());
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
