import { load } from "cheerio";
import { parse } from "date-fns";

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const SCORE_PATTERN = /(\d+)\s*[–-]\s*(\d+)/;
const TIMEZONE_OFFSETS: Record<string, number> = {
  AEDT: 11,
  AEST: 10,
  ART: -3,
  BST: 1,
  CEST: 2,
  CET: 1,
  GMT: 0,
  NZDT: 13,
  NZST: 12,
  SAST: 2,
  UTC: 0,
};

export type ParsedWikipediaMatch = {
  awayScore: number | null;
  awayTeamName: string;
  eventId: string | null;
  homeScore: number | null;
  homeTeamName: string;
  kickoffAt: string;
  lineupTableHtml: string | null;
  round: number | null;
  status: "finished" | "scheduled";
  venue: string | null;
  rawHtml: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseRoundFromId(roundId: string | undefined) {
  if (!roundId) {
    return null;
  }

  const matched = roundId.match(ROUND_ID_PATTERN);

  if (!matched) {
    return null;
  }

  return Number(matched[1]);
}

function buildUtcIsoString(params: {
  dateText: string;
  timeText: string | null;
  timezoneText: string | null;
}) {
  const parsedDate = parse(params.dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse fixture date: ${params.dateText}`);
  }

  const parts = (params.timeText ?? "00:00")
    .split(":")
    .map((part) => Number(part));
  const hours = parts[0];
  const minutes = parts[1];

  if (
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      `Unable to parse fixture time: ${params.timeText ?? "00:00"}`,
    );
  }

  const timezoneOffset = TIMEZONE_OFFSETS[params.timezoneText ?? "UTC"] ?? 0;
  const utcTimestamp = Date.UTC(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    hours - timezoneOffset,
    minutes,
  );

  return new Date(utcTimestamp).toISOString();
}

function parseKickoffAt(blockText: string) {
  const normalized = normalizeWhitespace(blockText);
  const withTime =
    normalized.match(
      /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})\s*([A-Z]{2,4})/,
    ) ?? [];

  if (withTime.length === 4) {
    return buildUtcIsoString({
      dateText: withTime[1]!,
      timeText: withTime[2]!,
      timezoneText: withTime[3]!,
    });
  }

  const dateOnly = normalized.match(/(\d{1,2} [A-Za-z]+ \d{4})/);

  if (!dateOnly) {
    throw new Error(`Unable to locate fixture kickoff text: ${normalized}`);
  }

  const dateText = dateOnly[1];

  if (!dateText) {
    throw new Error(`Unable to locate fixture date text: ${normalized}`);
  }

  return buildUtcIsoString({
    dateText,
    timeText: null,
    timezoneText: "UTC",
  });
}

function parseScore(scoreText: string) {
  const matched = normalizeWhitespace(scoreText).match(SCORE_PATTERN);

  if (!matched) {
    return {
      awayScore: null,
      homeScore: null,
      status: "scheduled" as const,
    };
  }

  return {
    awayScore: Number(matched[2]),
    homeScore: Number(matched[1]),
    status: "finished" as const,
  };
}

function findLineupTableHtml(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
) {
  let sibling = block.next();

  while (sibling.length > 0) {
    if (
      sibling.is("div.vevent.summary") ||
      (sibling.is("div.mw-heading") && sibling.find("h2, h3").length > 0)
    ) {
      break;
    }

    if (
      sibling.is("table") &&
      normalizeWhitespace(sibling.attr("class") ?? "") === ""
    ) {
      return $.html(sibling);
    }

    sibling = sibling.next();
  }

  return null;
}

export function parseWikipediaSixNationsHtml(
  html: string,
): ParsedWikipediaMatch[] {
  const $ = load(html);
  const fixturesSection = $("#Fixtures").closest("div");

  if (fixturesSection.length === 0) {
    throw new Error("Unable to locate the Wikipedia fixtures section.");
  }

  let currentRound: number | null = null;
  const parsedMatches: ParsedWikipediaMatch[] = [];
  let cursor = fixturesSection.next();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading") && cursor.find("h2").length > 0) {
      break;
    }

    if (cursor.is("div.mw-heading") && cursor.find("h3").length > 0) {
      currentRound = parseRoundFromId(cursor.find("h3").attr("id"));
      cursor = cursor.next();
      continue;
    }

    if (cursor.is("div.vevent.summary")) {
      const block = cursor;
      const tables = block.find("table");
      const dateTable = tables.eq(0);
      const matchupTable = tables.eq(1);
      const firstRowCells = matchupTable.find("tr").first().find("td");
      const score = parseScore(firstRowCells.eq(1).text());
      const homeTeamName = normalizeWhitespace(
        firstRowCells.eq(0).find("a").last().text(),
      );
      const awayTeamName = normalizeWhitespace(
        firstRowCells.eq(2).find("a").last().text(),
      );

      if (!homeTeamName || !awayTeamName) {
        throw new Error("Unable to parse team names from a vevent block.");
      }

      parsedMatches.push({
        awayScore: score.awayScore,
        awayTeamName,
        eventId: block.attr("id") ?? null,
        homeScore: score.homeScore,
        homeTeamName,
        kickoffAt: parseKickoffAt(dateTable.text()),
        lineupTableHtml: findLineupTableHtml($, block),
        rawHtml: $.html(block),
        round: currentRound,
        status: score.status,
        venue:
          normalizeWhitespace(block.find(".location").first().text()) || null,
      });
    }

    cursor = cursor.next();
  }

  if (parsedMatches.length === 0) {
    throw new Error(
      "No fixture vevent blocks were found in the Wikipedia page.",
    );
  }

  return parsedMatches;
}
