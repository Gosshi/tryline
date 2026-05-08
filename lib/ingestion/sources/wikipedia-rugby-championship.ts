import {
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  "New Zealand": "new-zealand",
  "South Africa": "south-africa",
};

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Rugby_Championship`;
}

export function parseRugbyChampionshipLiveHtml(
  html: string,
): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(parsedMatches, TEAM_SLUG_BY_WIKIPEDIA_NAME);
}

export async function fetchRugbyChampionship2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2026");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseRugbyChampionshipLiveHtml(await response.text());
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
