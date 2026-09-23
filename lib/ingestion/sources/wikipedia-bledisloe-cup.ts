import {
  isMissingWikipediaPage,
  mapWithTeamSlugs,
  toEmptyWhenMissingOrUnstructured,
} from "@/lib/ingestion/sources/live-source-utils";
import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Australia: "australia",
  "New Zealand": "new-zealand",
};

function buildWikipediaUrl() {
  return "https://en.wikipedia.org/wiki/2026_Bledisloe_Cup";
}

export function parseBledisloeCupLiveHtml(
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

export async function fetchBledisloeCup2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl();

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseBledisloeCupLiveHtml(await response.text(), sourceUrl);
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
