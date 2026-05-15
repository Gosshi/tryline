import { load } from "cheerio";
import { format, parse } from "date-fns";

import { normalizeWikipediaTeamName } from "@/lib/scrapers/wikipedia-team-name-map";

import type { WikipediaSeasonMatch } from "@/lib/scrapers/wikipedia-season-parser";

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;
const DATE_FORMATS = ["d MMMM yyyy", "dd MMMM yyyy"];

function dateKeyFromText(text: string): string | null {
  for (const dateFormat of DATE_FORMATS) {
    const parsed = parse(
      text.trim(),
      dateFormat,
      new Date(Date.UTC(2000, 0, 1)),
    );

    if (!Number.isNaN(parsed.getTime())) {
      return format(parsed, "yyyy-MM-dd");
    }
  }

  return null;
}

function roundNumberFromId(roundId: string): number | null {
  const match = roundId.match(/^Round_(\d+)$/);

  return match ? Number(match[1]) : null;
}

function findRoundTable($: ReturnType<typeof load>, roundId: string) {
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

export function parseWikipediaUrcSeasonMatches(
  html: string,
): WikipediaSeasonMatch[] {
  const $ = load(html);
  const matches: WikipediaSeasonMatch[] = [];
  const roundHeadings = $("h3[id^='Round_']")
    .toArray()
    .sort((left, right) => {
      const leftNum = roundNumberFromId($(left).attr("id") ?? "") ?? 0;
      const rightNum = roundNumberFromId($(right).attr("id") ?? "") ?? 0;

      return leftNum - rightNum;
    });

  for (const heading of roundHeadings) {
    const roundId = $(heading).attr("id");

    if (!roundId) {
      continue;
    }

    const table = findRoundTable($, roundId);

    if (!table) {
      continue;
    }

    const rows = table.find("tbody > tr").toArray();
    let matchIndex = 0;

    for (let index = 0; index < rows.length - 1; index += 2) {
      const infoRow = $(rows[index]!);

      if (!SCORE_PATTERN.test(infoRow.text())) {
        continue;
      }

      const cells = infoRow.children("td");
      const dateText = cells.eq(0).text().trim();
      const homeTeamName = normalizeWikipediaTeamName(
        cells.eq(1).find("a").first().text().trim(),
      );
      const awayTeamName = normalizeWikipediaTeamName(
        cells.eq(3).find("a").first().text().trim(),
      );

      if (!homeTeamName || !awayTeamName) {
        matchIndex += 1;
        continue;
      }

      matches.push({
        awayTeamName,
        dateKey: dateKeyFromText(dateText),
        dateText,
        homeTeamName,
        sectionId: `${roundId}_${matchIndex}`,
      });
      matchIndex += 1;
    }
  }

  return matches;
}
