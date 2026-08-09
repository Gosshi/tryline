import {
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { AUSTRALIA_JAPAN_WIKIPEDIA_URL } from "@/lib/scrapers/wikipedia-lipovitan-challenge-cup-results";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Australia: "australia",
  Japan: "japan",
};

export function parseLipovitanChallengeCupEventHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(parsedMatches, TEAM_SLUG_BY_WIKIPEDIA_NAME);
}

export async function fetchLipovitanChallengeCup2026EventMatches(): Promise<
  ParsedLiveMatch[]
> {
  try {
    const response = await fetchWithPolicy(AUSTRALIA_JAPAN_WIKIPEDIA_URL);
    return parseLipovitanChallengeCupEventHtml(
      await response.text(),
      AUSTRALIA_JAPAN_WIKIPEDIA_URL,
    );
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
