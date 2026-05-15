import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseLineupFromTableHtml } from "@/lib/scrapers/wikipedia-lineups";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type { WikipediaMatchLineup } from "@/lib/scrapers/wikipedia-lineups";
import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

export type WikipediaClubMatchDetailSource = {
  eventId: string | null;
  url: string;
};

export type WikipediaClubMatchDetails = {
  events: ParsedMatchEvent[];
  lineup: WikipediaMatchLineup | null;
};

function extractEventBlockHtml(html: string, eventId: string | null): string {
  if (!eventId) {
    return html;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  return eventBlock.length ? ($.html(eventBlock) ?? html) : html;
}

function extractLineupTableHtml(html: string, eventId: string | null): string | null {
  if (!eventId) {
    return null;
  }

  const $ = load(html);
  const eventBlock = $("[id]")
    .filter((_, element) => $(element).attr("id") === eventId)
    .first();

  if (!eventBlock.length) {
    return null;
  }

  let cursor = eventBlock.next();

  while (cursor.length > 0) {
    if (cursor.is("div.vevent.summary, h2, h3, div.mw-heading")) {
      return null;
    }

    if (cursor.is("table")) {
      return $.html(cursor);
    }

    const nestedTable = cursor.find("table").first();

    if (nestedTable.length > 0) {
      return $.html(nestedTable);
    }

    cursor = cursor.next();
  }

  return null;
}

export function parseWikipediaClubMatchDetailsHtml(
  html: string,
  source: WikipediaClubMatchDetailSource,
): WikipediaClubMatchDetails {
  const eventBlockHtml = extractEventBlockHtml(html, source.eventId);
  const lineupTableHtml = extractLineupTableHtml(html, source.eventId);

  return {
    events: parseMatchEventsFromVeventHtml(eventBlockHtml),
    lineup: lineupTableHtml
      ? parseLineupFromTableHtml(lineupTableHtml, source.url)
      : null,
  };
}

export async function scrapeWikipediaClubMatchDetails(
  source: WikipediaClubMatchDetailSource,
): Promise<WikipediaClubMatchDetails> {
  const response = await fetchWithPolicy(source.url);
  const html = await response.text();

  return parseWikipediaClubMatchDetailsHtml(html, source);
}
