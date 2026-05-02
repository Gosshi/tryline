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
  Argentina: "argentina",
  Australia: "australia",
  Canada: "canada",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Georgia: "georgia",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  Namibia: "namibia",
  "New Zealand": "new-zealand",
  Portugal: "portugal",
  Romania: "romania",
  Samoa: "samoa",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Spain: "spain",
  Tonga: "tonga",
  Uruguay: "uruguay",
  USA: "usa",
  "United States": "usa",
  Wales: "wales",
};

function parseSeason(season: string) {
  if (!/^\d{4}$/.test(season)) {
    throw new Error(`Autumn Nations season must be YYYY: ${season}`);
  }

  return Number(season);
}

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Autumn_Nations_Series`;
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown Autumn Nations team name: ${teamName}`);
  }

  return slug;
}

export function parseAutumnNationsResultsHtml(
  html: string,
  season: string,
  sourceUrl = buildWikipediaUrl(season),
): HistoricalMatchResult[] {
  const seasonNumber = parseSeason(season);
  const parsedMatches = parseWikipediaSixNationsHtml(html);

  return parsedMatches
    .filter((match) => match.status === "finished")
    .map((match) => {
      if (match.homeScore === null || match.awayScore === null) {
        throw new Error(
          `Missing score for Autumn Nations ${season}: ${match.homeTeamName} vs ${match.awayTeamName}`,
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

export const wikipediaAutumnNationsResultsScraper: CompetitionResultScraper = {
  async fetchResults(season: string) {
    const sourceUrl = buildWikipediaUrl(season);
    const response = await fetchWithPolicy(sourceUrl);
    const html = await response.text();

    return parseAutumnNationsResultsHtml(html, season, sourceUrl);
  },
};
