import { load } from "cheerio";

import {
  buildUtcIsoString,
  isMissingWikipediaPage,
  normalizeWhitespace,
  parseScoreText,
} from "@/lib/ingestion/sources/live-source-utils";
import { findAdjacentLineupTableHtml } from "@/lib/ingestion/sources/wikipedia-lineup-table";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const PLAYOFF_ROUNDS: Record<string, number> = {
  "Quarter-finals": 100,
  "Semi-finals": 101,
  URC_Grand_Final: 102,
};
const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Benetton: "benetton",
  Bulls: "bulls",
  Cardiff: "cardiff",
  Connacht: "connacht",
  Dragons: "dragons",
  Edinburgh: "edinburgh",
  "Glasgow Warriors": "glasgow-warriors",
  Leinster: "leinster",
  Lions: "lions",
  Munster: "munster",
  Ospreys: "ospreys",
  Scarlets: "scarlets",
  Sharks: "sharks",
  Stormers: "stormers",
  Ulster: "ulster",
  "Zebre Parma": "zebre",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_United_Rugby_Championship`;
}

function parseKickoffAt(dateText: string, timeText: string | null) {
  return buildUtcIsoString({
    dateText,
    timeText,
  });
}

function parseKickoffText(value: string) {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(
    /(\d{1,2} [A-Za-z]+ \d{4})(?:\s*(\d{1,2}:\d{2}))?/,
  );

  if (!matched) {
    throw new Error(`Unable to locate URC kickoff text: ${normalized}`);
  }

  return parseKickoffAt(matched[1]!, matched[2] ?? null);
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

export function parseUrcLiveHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const $ = load(html);
  const results: ParsedLiveMatch[] = [];

  for (const element of $("table.mw-collapsible.mw-collapsed").toArray()) {
    const block = $(element);
    const sectionId = getSectionId($, block);
    const round = resolveRound(sectionId);

    if (round === undefined) {
      continue;
    }

    const rows = block.find("tr");
    const firstRowCells = rows.first().find("td");
    const secondRowCells = rows.eq(1).find("td");

    const dateText = normalizeWhitespace(firstRowCells.eq(0).text());
    const timeText = normalizeWhitespace(secondRowCells.eq(0).text());
    const kickoffText = timeText ? `${dateText} ${timeText}` : dateText;

    let kickoffAt: string;
    try {
      kickoffAt = parseKickoffText(kickoffText);
    } catch {
      continue;
    }

    const homeTeamName = normalizeWhitespace(
      firstRowCells.eq(1).find("a").first().text(),
    );
    const awayTeamName = normalizeWhitespace(
      firstRowCells.eq(3).find("a").last().text(),
    );
    const homeTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[homeTeamName];
    const awayTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[awayTeamName];

    if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) {
      continue;
    }

    const score = parseScoreText(firstRowCells.eq(2).text());

    results.push({
      awayScore: score.awayScore,
      awayTeamName,
      awayTeamSlug,
      eventId: `${sectionId}_${homeTeamName.replace(/\s+/g, "_")}_v_${awayTeamName.replace(/\s+/g, "_")}`,
      homeScore: score.homeScore,
      homeTeamName,
      homeTeamSlug,
      kickoffAt,
      lineupTableHtml: findAdjacentLineupTableHtml($, block),
      rawHtml: $.html(block),
      round,
      roundName: null,
      status: score.status,
      venue: normalizeWhitespace(firstRowCells.eq(4).text()) || null,
      wikipediaUrl,
    });
  }

  return results;
}

export async function fetchUrc202526(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2025-26");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseUrcLiveHtml(await response.text(), sourceUrl);
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
