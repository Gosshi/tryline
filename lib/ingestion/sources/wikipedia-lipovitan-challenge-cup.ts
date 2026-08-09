import { isMissingWikipediaPage } from "@/lib/ingestion/sources/live-source-utils";
import {
  AUSTRALIA_JAPAN_WIKIPEDIA_URL,
  wikipediaLipovitanChallengeCupResultsScraper,
} from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";
import type { LipovitanChallengeCupMatchResult } from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

const TEAM_NAME_BY_SLUG: Record<string, string> = {
  australia: "Australia",
  canada: "Canada",
  fiji: "Fiji",
  japan: "Japan",
};

function resolveEnglishWikipediaUrl(result: LipovitanChallengeCupMatchResult) {
  const isAustraliaJapan =
    (result.home_team_slug === "australia" &&
      result.away_team_slug === "japan") ||
    (result.home_team_slug === "japan" &&
      result.away_team_slug === "australia");

  return isAustraliaJapan ? AUSTRALIA_JAPAN_WIKIPEDIA_URL : null;
}

export function adaptLipovitanChallengeCupResults(
  results: LipovitanChallengeCupMatchResult[],
): ParsedLiveMatch[] {
  return results.map((result) => {
    const wikipediaUrl = resolveEnglishWikipediaUrl(result);

    if (!wikipediaUrl) {
      console.warn(
        `[lipovitan-challenge-cup-2026] No dedicated English Wikipedia event page for ${result.home_team_slug} vs ${result.away_team_slug}; wikipedia_url omitted.`,
      );
    }

    return {
      awayScore: result.away_score,
      awayTeamName:
        TEAM_NAME_BY_SLUG[result.away_team_slug] ?? result.away_team_slug,
      awayTeamSlug: result.away_team_slug,
      eventId: result.wikipedia_event_id,
      homeScore: result.home_score,
      homeTeamName:
        TEAM_NAME_BY_SLUG[result.home_team_slug] ?? result.home_team_slug,
      homeTeamSlug: result.home_team_slug,
      kickoffAt: result.kickoff_at,
      lineupTableHtml: null,
      rawHtml: "",
      round: result.round,
      roundName: null,
      status: result.status,
      venue: result.venue,
      wikipediaUrl,
    };
  });
}

export async function fetchLipovitanChallengeCup2026(): Promise<
  ParsedLiveMatch[]
> {
  try {
    return adaptLipovitanChallengeCupResults(
      await wikipediaLipovitanChallengeCupResultsScraper.fetchResults("2026"),
    );
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
