import {
  parseWikipediaSixNations2027Html,
  WIKIPEDIA_SIX_NATIONS_2027_URL,
} from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedLiveMatch } from "@/lib/ingestion/sources/live-source-utils";

export function parseSixNations2027LiveHtml(html: string): ParsedLiveMatch[] {
  return parseWikipediaSixNations2027Html(html);
}

export async function fetchSixNations2027(): Promise<ParsedLiveMatch[]> {
  const response = await fetchWithPolicy(WIKIPEDIA_SIX_NATIONS_2027_URL);

  return parseSixNations2027LiveHtml(await response.text());
}
