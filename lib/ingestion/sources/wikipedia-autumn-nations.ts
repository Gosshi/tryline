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

function buildWikipediaUrl(season: string) {
  return `https://en.wikipedia.org/wiki/${season}_Autumn_Nations_Series`;
}

export function parseAutumnNationsLiveHtml(
  html: string,
  wikipediaUrl: string | null = null,
): ParsedLiveMatch[] {
  const parsedMatches = toEmptyWhenMissingOrUnstructured(
    () => parseWikipediaSixNationsHtml(html, wikipediaUrl),
    ["Unable to locate the Wikipedia fixtures section", "No fixture vevent"],
  );

  return mapWithTeamSlugs(parsedMatches, TEAM_SLUG_BY_WIKIPEDIA_NAME);
}

export async function fetchAutumnNations2026(): Promise<ParsedLiveMatch[]> {
  const sourceUrl = buildWikipediaUrl("2026");

  try {
    const response = await fetchWithPolicy(sourceUrl);
    return parseAutumnNationsLiveHtml(await response.text(), sourceUrl);
  } catch (error) {
    if (isMissingWikipediaPage(error)) {
      return [];
    }

    throw error;
  }
}
