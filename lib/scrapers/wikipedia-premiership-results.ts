import { load } from "cheerio";

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

export interface CompetitionResultScraper {
  fetchResults(season: string): Promise<HistoricalMatchResult[]>;
}

const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const SCORE_PATTERN = /(\d+)\s*[–-]\s*(\d+)/;
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

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown Premiership team name: ${teamName}`);
  }

  return slug;
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
): HistoricalMatchResult[] {
  const parsedSeason = parseSeason(season);
  const $ = load(html);
  const results: HistoricalMatchResult[] = [];

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

    if (!homeTeamName || !awayTeamName) {
      throw new Error(
        "Unable to parse Premiership team names from a vevent block.",
      );
    }

    const kickoffAt = parsePremiershipKickoffAt(dateTable.text());

    if (!kickoffAt) {
      console.warn(
        `Skipping Premiership result with unparseable kickoff: ${homeTeamName} vs ${awayTeamName}`,
      );
      continue;
    }

    results.push({
      away_score: score.awayScore,
      away_team_slug: resolveTeamSlug(awayTeamName),
      home_score: score.homeScore,
      home_team_slug: resolveTeamSlug(homeTeamName),
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

  if (results.length === 0) {
    throw new Error(
      "No finished Premiership regular season matches were found.",
    );
  }

  return results;
}

export const wikipediaPremiershipResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parsePremiershipResultsHtml(html, season, sourceUrl);
  },
};
