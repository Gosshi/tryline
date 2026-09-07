import { load } from "cheerio";

import { resolvePremiershipTeamSlug } from "@/lib/ingestion/sources/premiership-team-slugs";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parsePremiershipKickoffAt } from "@/lib/scrapers/premiership-kickoff";

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

export type SkippedPremiershipResult = {
  awayTeamName: string;
  homeTeamName: string;
  round: number | null;
  unknownTeamNames: string[];
  wikipediaEventId: string | null;
};

export type PremiershipResultsParseResult = {
  results: HistoricalMatchResult[];
  skippedMatchCount: number;
  skippedMatches: SkippedPremiershipResult[];
  unknownTeamNames: string[];
};

export interface CompetitionResultScraper {
  fetchResults(season: string): Promise<PremiershipResultsParseResult>;
}

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const SCORE_PATTERN = /(\d+)\s*[–-]\s*(\d+)/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseSeason(season: string) {
  if (!/^\d{4}-\d{2}$/.test(season)) {
    throw new Error(`Premiership season must be YYYY-YY: ${season}`);
  }

  return season;
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season.replace("-", "–")}_Premiership_Rugby`;
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
  if (block.parents('section[aria-labelledby="Regular_season"]').length > 0) {
    return true;
  }

  let cursor = block.prev();

  while (cursor.length > 0) {
    if (cursor.is("div.mw-heading") && cursor.find("h2").length > 0) {
      return cursor.find("h2").attr("id") === "Regular_season";
    }

    cursor = cursor.prev();
  }

  return false;
}

export function parsePremiershipResultsHtml(
  html: string,
  season: string,
  sourceUrl = buildWikipediaUrl(season),
): PremiershipResultsParseResult {
  const parsedSeason = parseSeason(season);
  const $ = load(html);
  const results: HistoricalMatchResult[] = [];
  const skippedMatches: SkippedPremiershipResult[] = [];

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

    const kickoffAt = parsePremiershipKickoffAt(dateTable.text());

    if (!kickoffAt) {
      console.warn(
        `Skipping Premiership result with unparseable kickoff: ${homeTeamName} vs ${awayTeamName}`,
      );
      continue;
    }

    const homeTeamSlug = resolvePremiershipTeamSlug(homeTeamName);
    const awayTeamSlug = resolvePremiershipTeamSlug(awayTeamName);

    if (!homeTeamSlug || !awayTeamSlug) {
      skippedMatches.push({
        awayTeamName,
        homeTeamName,
        round: parseRoundFromHeading($, block),
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
      kickoff_at: kickoffAt,
      round: parseRoundFromHeading($, block),
      season: parsedSeason,
      source_url: sourceUrl,
      venue:
        normalizeWhitespace(venueTable.find(".location").first().text()) ||
        null,
      wikipedia_event_id: block.attr("id") ?? null,
    });
  }

  if (results.length === 0 && skippedMatches.length === 0) {
    throw new Error(
      "No finished Premiership regular season matches were found.",
    );
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

export const wikipediaPremiershipResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parsePremiershipResultsHtml(html, season, sourceUrl);
  },
};
