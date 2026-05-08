import { load } from "cheerio";

import {
  buildUtcIsoString,
  isMissingWikipediaPage,
  normalizeWhitespace,
  parseScoreText,
} from "@/lib/ingestion/sources/live-source-utils";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

type Stage = { id: string; round: number };

const STAGES: Stage[] = [
  { id: "Quarter-finals", round: 1 },
  { id: "Semi-finals", round: 2 },
  { id: "URC_Grand_Final", round: 3 },
];
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

export function parseUrcLiveHtml(html: string): ParsedLiveMatch[] {
  const $ = load(html);
  const stageById = new Map(STAGES.map((stage) => [stage.id, stage.round]));
  const results: ParsedLiveMatch[] = [];

  for (const element of $("div.vevent.summary").toArray()) {
    const block = $(element);
    const sectionId = getSectionId($, block);
    const round = stageById.get(sectionId ?? "");

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
      status: score.status,
      venue:
        normalizeWhitespace(venueTable.find(".location").first().text()) ||
        null,
    });
  }

  return results;
}

export async function fetchUrc202526(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2025-26");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseUrcLiveHtml(await response.text());
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
