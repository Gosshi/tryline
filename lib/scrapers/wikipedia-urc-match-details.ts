import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import {
  parseMatchEventsFromUrcDetailRowHtml,
} from "@/lib/scrapers/wikipedia-match-events";

import type {
  WikipediaClubMatchDetails,
  WikipediaClubMatchDetailSource,
} from "@/lib/scrapers/wikipedia-club-match-details";

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;

function findRoundTable(
  $: ReturnType<typeof load>,
  roundId: string,
) {
  const heading = $(`h3#${roundId}`).first();

  if (!heading.length) {
    return null;
  }

  const headingWrapper = heading.closest(".mw-heading");
  let cursor = (headingWrapper.length ? headingWrapper : heading).next();

  while (cursor.length) {
    if (cursor.is("div.mw-heading")) {
      break;
    }

    if (cursor.is("table.mw-collapsible")) {
      return cursor;
    }

    const nestedTable = cursor.find("table.mw-collapsible").first();

    if (nestedTable.length) {
      return nestedTable;
    }

    cursor = cursor.next();
  }

  return null;
}

export function parseWikipediaUrcMatchDetailsHtml(
  html: string,
  source: WikipediaClubMatchDetailSource,
): WikipediaClubMatchDetails {
  if (!source.eventId) {
    return { events: [], lineup: null };
  }

  const matched = source.eventId.match(/^(Round_\d+)_(\d+)$/);

  if (!matched) {
    return { events: [], lineup: null };
  }

  const [, roundId, indexText] = matched;
  const matchIndex = Number(indexText);
  const $ = load(html);
  const table = findRoundTable($, roundId!);

  if (!table) {
    return { events: [], lineup: null };
  }

  const rows = table.find("tbody > tr").toArray();
  let parsedIndex = 0;

  for (let index = 0; index < rows.length - 1; index += 2) {
    const infoRow = $(rows[index]!);

    if (!SCORE_PATTERN.test(infoRow.text())) {
      continue;
    }

    if (parsedIndex === matchIndex) {
      const detailRow = rows[index + 1];

      return {
        events: detailRow
          ? parseMatchEventsFromUrcDetailRowHtml($.html($(detailRow)) ?? "")
          : [],
        lineup: null,
      };
    }

    parsedIndex += 1;
  }

  return { events: [], lineup: null };
}

export async function scrapeWikipediaUrcMatchDetails(
  source: WikipediaClubMatchDetailSource,
): Promise<WikipediaClubMatchDetails> {
  const response = await fetchWithPolicy(source.url);
  const html = await response.text();

  return parseWikipediaUrcMatchDetailsHtml(html, source);
}
