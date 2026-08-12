import { load } from "cheerio";

import {
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
import { parsePremiershipKickoffAt } from "@/lib/scrapers/premiership-kickoff";

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
  "Newcastle Red Bulls": "newcastle-falcons",
  Northampton: "northampton-saints",
  "Northampton Saints": "northampton-saints",
  Sale: "sale-sharks",
  "Sale Sharks": "sale-sharks",
  Saracens: "saracens",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Premiership_Rugby`;
}

function buildWikipediaPageTitle(season: string) {
  return `${season.replace("-", "–")} Premiership Rugby`;
}

function getWikitextRoundInfo(wikitext: string, beforeIndex: number) {
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

  const round = currentHeading.match(/^Round\s+(\d+)$/i);

  if (round) {
    return { round: Number(round[1]), roundName: null };
  }

  return { round: null, roundName: currentHeading };
}

function normalizeWikipediaEventId(eventId: string) {
  return normalizeWhitespace(eventId).replace(/\s+/g, "_");
}

function buildPremiershipMatchKey(match: ParsedLiveMatch) {
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
    htmlMatches.map((match) => [buildPremiershipMatchKey(match), match.rawHtml]),
  );

  return wikitextMatches.map((match) => {
    const rawHtml =
      (match.eventId ? rawHtmlByEventId.get(match.eventId) : undefined) ??
      rawHtmlByMatchKey.get(buildPremiershipMatchKey(match));

    if (!rawHtml) {
      throw new Error(
        `Unable to preserve event HTML for Premiership match: ${match.homeTeamName} vs ${match.awayTeamName} (${match.kickoffAt}).`,
      );
    }

    return { ...match, rawHtml };
  });
}

function getHeadingInfo(
  $: ReturnType<typeof load>,
  block: ReturnType<ReturnType<typeof load>>,
): { round: number | null; roundName: string | null } {
  let cursor = block.prev();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading")) {
      const h3 = cursor.find("h3").first();
      const h2 = cursor.find("h2").first();
      const matched = h3.attr("id")?.match(ROUND_ID_PATTERN);

      if (matched) {
        return { round: Number(matched[1]), roundName: null };
      }

      const headingText = normalizeWhitespace(h3.text() || h2.text());

      if (headingText) {
        return { round: null, roundName: headingText };
      }
    }

    cursor = cursor.prev();
  }

  return { round: null, roundName: null };
}

export function parsePremiershipLiveHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const $ = load(html);
  const results: ParsedLiveMatch[] = [];

  for (const element of $("div.vevent.summary").toArray()) {
    const block = $(element);
    const { round, roundName } = getHeadingInfo($, block);

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

    const kickoffAt = parsePremiershipKickoffAt(dateTable.text());

    if (!kickoffAt) {
      console.warn(
        `Skipping Premiership live match with unparseable kickoff: ${homeTeamName} vs ${awayTeamName}`,
      );
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
      kickoffAt,
      lineupTableHtml: null,
      rawHtml: $.html(block),
      round,
      roundName,
      status: score.status,
      venue:
        normalizeWhitespace(venueTable.find(".location").first().text()) ||
        null,
      wikipediaUrl,
    });
  }

  return results.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
}

export function parsePremiershipLiveWikitext(
  wikitext: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const rugbyboxes = parseWikitextTemplates(wikitext, "rugbybox");

  if (rugbyboxes.length === 0) {
    throw new Error("No rugbybox templates found in Premiership wikitext.");
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

    const kickoffAt = parsePremiershipKickoffAt(
      `${dateText} ${timeText}`.trim(),
    );

    if (!kickoffAt) {
      console.warn(
        `Skipping Premiership live match with unparseable kickoff: ${homeTeamName} vs ${awayTeamName}`,
      );
      continue;
    }

    const score = parseScoreText(stripWikitextMarkup(rugbybox.params.score ?? ""));
    const { round, roundName } = getWikitextRoundInfo(
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

export async function fetchPremiership(
  season: string,
): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl(season);

  try {
    const wikitext = await fetchWikipediaWikitext([
      buildWikipediaPageTitle(season),
    ]);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();
    const wikitextMatches = parsePremiershipLiveWikitext(wikitext, sourceUrl);
    const htmlMatches = parsePremiershipLiveHtml(html, sourceUrl);

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
