import { load } from "cheerio";

import {
  buildUtcIsoString,
  clearFutureZeroScores,
  isMissingWikipediaPage,
  normalizeWhitespace,
  parseScoreText,
} from "@/lib/ingestion/sources/live-source-utils";
import {
  fetchWikipediaWikitext,
  normalizeWikitextTeam,
  parseWikitextTemplates,
  stripWikitextMarkup,
} from "@/lib/ingestion/sources/wikipedia-wikitext";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const WIKITEXT_ROUND_PATTERN = /^Round\s+(\d+)$/i;
const WIKITEXT_DATE_PATTERN =
  /^(\d{1,2})(?:\/\d{1,2})*\s+([A-Za-z]+)(?:\s+(\d{4}))?$/;
const MONTH_NUMBERS: Record<string, number> = {
  april: 4,
  august: 8,
  december: 12,
  february: 2,
  january: 1,
  july: 7,
  june: 6,
  march: 3,
  may: 5,
  november: 11,
  october: 10,
  september: 9,
};
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
  Zebre: "zebre",
  "Zebre Parma": "zebre",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_United_Rugby_Championship`;
}

function buildWikipediaPageTitle(season: string) {
  return `${season.replace("-", "–")} United Rugby Championship`;
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

function getWikitextRound(wikitext: string, beforeIndex: number) {
  const headingPattern = /^===\s*([^=].*?)\s*===\s*$/gm;
  let currentHeading: string | null = null;
  let matched: RegExpExecArray | null;

  while ((matched = headingPattern.exec(wikitext))) {
    if (matched.index >= beforeIndex) {
      break;
    }

    currentHeading = normalizeWhitespace(matched[1] ?? "");
  }

  if (!currentHeading) {
    return { round: null, roundName: null };
  }

  const round = currentHeading.match(WIKITEXT_ROUND_PATTERN);

  if (round) {
    return { round: Number(round[1]), roundName: null };
  }

  return {
    round: resolveRound(currentHeading.replaceAll(" ", "_")) ?? null,
    roundName: currentHeading,
  };
}

function parseUrcWikitextKickoffAt(
  dateText: string,
  timeText: string,
  season: string,
) {
  const seasonMatched = season.match(/^(\d{4})-(\d{2})$/);
  const dateMatched = normalizeWhitespace(dateText).match(
    WIKITEXT_DATE_PATTERN,
  );

  if (!seasonMatched || !dateMatched) {
    return null;
  }

  const month = MONTH_NUMBERS[dateMatched[2]!.toLowerCase()];

  if (!month) {
    return null;
  }

  const startYear = Number(seasonMatched[1]);
  const endYear = Math.floor(startYear / 100) * 100 + Number(seasonMatched[2]);
  const year = dateMatched[3]
    ? Number(dateMatched[3])
    : month >= 8
      ? startYear
      : endYear;

  try {
    return buildUtcIsoString({
      dateText: `${dateMatched[1]} ${dateMatched[2]} ${year}`,
      timeText: timeText || null,
    });
  } catch {
    return null;
  }
}

function normalizeWikipediaEventId(eventId: string) {
  return normalizeWhitespace(eventId).replace(/\s+/g, "_");
}

function buildUrcMatchKey(match: ParsedLiveMatch) {
  return [match.homeTeamSlug, match.awayTeamSlug, match.kickoffAt].join(":");
}

function preserveMatchEventHtml(
  wikitextMatches: ParsedLiveMatch[],
  htmlMatches: ParsedLiveMatch[],
) {
  const rawHtmlByEventId = new Map(
    htmlMatches.flatMap((match) =>
      match.eventId ? [[match.eventId, match.rawHtml] as const] : [],
    ),
  );
  const rawHtmlByMatchKey = new Map(
    htmlMatches.map((match) => [buildUrcMatchKey(match), match.rawHtml]),
  );

  return wikitextMatches.map((match) => {
    const rawHtml =
      (match.eventId ? rawHtmlByEventId.get(match.eventId) : undefined) ??
      rawHtmlByMatchKey.get(buildUrcMatchKey(match));

    if (!rawHtml) {
      console.warn(
        `No event HTML for URC match: ${match.homeTeamName} vs ${match.awayTeamName} (${match.kickoffAt}); will retry on the next ingest.`,
      );
    }

    return { ...match, rawHtml: rawHtml ?? "" };
  });
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
      console.warn(
        `Skipping live match with unknown team: ${homeTeamName} vs ${awayTeamName}`,
      );
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
      lineupTableHtml: null,
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

export function parseUrcLiveWikitext(
  wikitext: string,
  season: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const rugbyboxes = parseWikitextTemplates(wikitext, "rugbybox");

  if (rugbyboxes.length === 0) {
    throw new Error("No rugbybox templates found in URC wikitext.");
  }

  const results: ParsedLiveMatch[] = [];

  for (const rugbybox of rugbyboxes) {
    const dateText = stripWikitextMarkup(rugbybox.params.date ?? "");
    const timeText = stripWikitextMarkup(rugbybox.params.time ?? "");
    const homeTeamName = normalizeWikitextTeam(
      rugbybox.params.home ?? rugbybox.params.team1 ?? "",
    );
    const awayTeamName = normalizeWikitextTeam(
      rugbybox.params.away ?? rugbybox.params.team2 ?? "",
    );
    const homeTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[homeTeamName];
    const awayTeamSlug = TEAM_SLUG_BY_WIKIPEDIA_NAME[awayTeamName];

    if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) {
      console.warn(
        `Skipping live match with unknown team: ${homeTeamName} vs ${awayTeamName}`,
      );
      continue;
    }

    const kickoffAt = parseUrcWikitextKickoffAt(dateText, timeText, season);

    if (!kickoffAt) {
      console.warn(
        `Skipping URC wikitext match with unparseable kickoff: ${homeTeamName} vs ${awayTeamName} (${dateText})`,
      );
      continue;
    }

    const score = parseScoreText(
      stripWikitextMarkup(rugbybox.params.score ?? ""),
    );
    const { round, roundName } = getWikitextRound(
      wikitext,
      rugbybox.startIndex,
    );

    results.push({
      awayScore: score.awayScore,
      awayTeamName,
      awayTeamSlug,
      eventId: rugbybox.params.id
        ? normalizeWikipediaEventId(rugbybox.params.id)
        : `${homeTeamSlug}_${awayTeamSlug}_${kickoffAt}`,
      homeScore: score.homeScore,
      homeTeamName,
      homeTeamSlug,
      kickoffAt,
      lineupTableHtml: null,
      rawHtml: "",
      round,
      roundName,
      status: score.status,
      venue: stripWikitextMarkup(rugbybox.params.stadium ?? "") || null,
      wikipediaUrl,
    });
  }

  return results.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
}

export async function fetchUrc(season: string): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl(season);

  try {
    const wikitext = await fetchWikipediaWikitext([
      buildWikipediaPageTitle(season),
    ]);
    const wikitextMatches = parseUrcLiveWikitext(wikitext, season, sourceUrl);
    let htmlMatches: ParsedLiveMatch[] = [];

    try {
      const response = await fetchWithPolicy(sourceUrl);
      htmlMatches = parseUrcLiveHtml(await response.text(), sourceUrl);
    } catch (error) {
      console.warn(
        `Unable to fetch event HTML for URC ${season}; continuing without event HTML.`,
        error,
      );
    }

    return clearFutureZeroScores(
      preserveMatchEventHtml(wikitextMatches, htmlMatches),
    );
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
