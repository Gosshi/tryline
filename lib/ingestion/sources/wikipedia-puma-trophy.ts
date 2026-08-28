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
};

function buildWikipediaUrl() {
  return "https://en.wikipedia.org/wiki/2026_Australia_rugby_union_tour_of_Argentina";
}

export function parsePumaTrophyLiveHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(
    parsedMatches.map((match) => ({
      ...match,
      venue: match.venue?.replace(/\[\d+\]$/, "") || null,
    })),
    TEAM_SLUG_BY_WIKIPEDIA_NAME,
  );
}

export async function fetchPumaTrophy2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl();

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parsePumaTrophyLiveHtml(await response.text(), sourceUrl);
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
