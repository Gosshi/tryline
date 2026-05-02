import { load } from "cheerio";

import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type HistoricalMatchResult = {
  season: number;
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

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Canada: "canada",
  Fiji: "fiji",
  Japan: "japan",
  Samoa: "samoa",
  Tonga: "tonga",
  USA: "usa",
  "United States": "usa",
};

function parseSeason(season: string) {
  if (!/^\d{4}$/.test(season)) {
    throw new Error(`Pacific Nations Cup season must be YYYY: ${season}`);
  }

  return Number(season);
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_World_Rugby_Pacific_Nations_Cup`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown Pacific Nations Cup team name: ${teamName}`);
  }

  return slug;
}

function wrapVeventsWithFixturesSection(html: string) {
  const $ = load(html);
  const blocks = $("div.vevent.summary").toArray();

  if (blocks.length === 0) {
    throw new Error("No Pacific Nations Cup vevent blocks were found.");
  }

  return [
    '<div class="mw-heading mw-heading2"><h2 id="Fixtures">Fixtures</h2></div>',
    ...blocks.map((block) => $.html(block)),
  ].join("\n");
}

export function parsePacificNationsCupResultsHtml(
  html: string,
  season: string,
  sourceUrl = buildWikipediaUrl(season),
): HistoricalMatchResult[] {
  const seasonNumber = parseSeason(season);
  const parsedMatches = parseWikipediaSixNationsHtml(
    wrapVeventsWithFixturesSection(html),
  );

  return parsedMatches
    .filter((match) => match.status === "finished")
    .map((match) => {
      if (match.homeScore === null || match.awayScore === null) {
        throw new Error(
          `Missing score for Pacific Nations Cup ${season}: ${match.homeTeamName} vs ${match.awayTeamName}`,
        );
      }

      return {
        away_score: match.awayScore,
        away_team_slug: resolveTeamSlug(match.awayTeamName),
        home_score: match.homeScore,
        home_team_slug: resolveTeamSlug(match.homeTeamName),
        kickoff_at: match.kickoffAt,
        round: match.round,
        season: seasonNumber,
        source_url: sourceUrl,
        venue: match.venue,
        wikipedia_event_id: match.eventId,
      };
    });
}

export const wikipediaPacificNationsCupResultsScraper: CompetitionResultScraper =
  {
    async fetchResults(season: string) {
      const sourceUrl = buildWikipediaUrl(season);
      const response = await fetchWithPolicy(sourceUrl);
      const html = await response.text();

      return parsePacificNationsCupResultsHtml(html, season, sourceUrl);
    },
  };
