import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { parseMatchEventsFromVeventHtml } from "@/lib/scrapers/wikipedia-match-events";

import type {
  WikipediaClubMatchDetailSource,
  WikipediaClubMatchDetails,
} from "@/lib/scrapers/wikipedia-club-match-details";

function extractEventBlockHtml(
  html: string,
  eventId: string | null,
): string | null {
  const $ = load(html);

  if (!eventId) {
    const vevents = $("div.vevent.summary");

    if (vevents.length === 1) {
      return $.html(vevents.first()) ?? null;
    }

    return vevents.first().length ? ($.html(vevents.first()) ?? null) : null;
  }

  const directEvent = $(`[id="${eventId}"]`).closest("div.vevent.summary");

  if (directEvent.length > 0) {
    return $.html(directEvent.first()) ?? null;
  }

  const anchor = $(`[id="${eventId}"]`).first();

  if (!anchor.length) {
    return null;
  }

  const heading = anchor.closest(".mw-heading");

  if (heading.length > 0) {
    let cursor = heading.next();

    while (cursor.length > 0) {
      if (cursor.is(".mw-heading")) {
        break;
      }

      if (cursor.is("div.vevent.summary")) {
        return $.html(cursor) ?? null;
      }

      const nestedVevent = cursor.find("div.vevent.summary").first();

      if (nestedVevent.length > 0) {
        return $.html(nestedVevent) ?? null;
      }

      cursor = cursor.next();
    }
  }

  const fallbackVevent = anchor.nextAll("div.vevent.summary").first();

  return fallbackVevent.length > 0 ? ($.html(fallbackVevent) ?? null) : null;
}

export function parseWikipediaRwcMatchEventsHtml(
  html: string,
  source: WikipediaClubMatchDetailSource,
): WikipediaClubMatchDetails {
  const eventBlockHtml = extractEventBlockHtml(html, source.eventId);

  return {
    events: eventBlockHtml ? parseMatchEventsFromVeventHtml(eventBlockHtml) : [],
    lineup: null,
  };
}

export async function scrapeWikipediaRwcMatchEvents(
  source: WikipediaClubMatchDetailSource,
): Promise<WikipediaClubMatchDetails> {
  const response = await fetchWithPolicy(source.url);
  const html = await response.text();

  return parseWikipediaRwcMatchEventsHtml(html, source);
}
