import {
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

export const NATIONS_CHAMPIONSHIP_SOUTHERN_HEMISPHERE_URL =
  "https://en.wikipedia.org/wiki/2026_Nations_Championship_Southern_Hemisphere_Series";
export const NATIONS_CHAMPIONSHIP_NORTHERN_HEMISPHERE_URL =
  "https://en.wikipedia.org/wiki/2026_Nations_Championship_Northern_Hemisphere_Series";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  "New Zealand": "new-zealand",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Wales: "wales",
};

export function parseNationsChampionshipEventHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(parsedMatches, TEAM_SLUG_BY_WIKIPEDIA_NAME);
}

async function fetchEventPage(url: string): Promise<ParsedLiveMatch[]> {
  try {
    const response = await fetchWithPolicy(url);
    return parseNationsChampionshipEventHtml(await response.text(), url);
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}

export async function fetchNationsChampionship2026EventMatches(): Promise<
  ParsedLiveMatch[]
> {
  const [southern, northern] = await Promise.all([
    fetchEventPage(NATIONS_CHAMPIONSHIP_SOUTHERN_HEMISPHERE_URL),
    fetchEventPage(NATIONS_CHAMPIONSHIP_NORTHERN_HEMISPHERE_URL),
  ]);

  return [...southern, ...northern];
}
