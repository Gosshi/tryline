import {
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Bulls: "bulls",
  Lions: "lions",
  "New Zealand": "new-zealand",
  Sharks: "sharks",
  "South Africa": "south-africa",
  Stormers: "stormers",
};

function buildWikipediaUrl() {
  return "https://en.wikipedia.org/wiki/2026_New_Zealand_rugby_union_tour_of_South_Africa";
}

export function parseGreatestRivalryLiveHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(parsedMatches, TEAM_SLUG_BY_WIKIPEDIA_NAME);
}

export async function fetchGreatestRivalry2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl();

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseGreatestRivalryLiveHtml(await response.text(), sourceUrl);
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
