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

function teamNameEventIdSegment(name: string): string {
  return normalizeWikipediaTeamName(name)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function firstNonEmptyLinkText(
  $: ReturnType<typeof load>,
  cell: ReturnType<ReturnType<typeof load>>,
): string {
  return cell
    .find("a")
    .filter((_, element) => $(element).text().trim() !== "")
    .first()
    .text()
    .trim();
}

function findRoundTables($: ReturnType<typeof load>, roundId: string) {
  const heading = $(`h3#${roundId}`).first();

  if (!heading.length) {
    return [];
  }

  const headingWrapper = heading.closest(".mw-heading");
  let cursor = (headingWrapper.length ? headingWrapper : heading).next();
  const tables: unknown[] = [];

  while (cursor.length) {
    if (cursor.is("div.mw-heading")) {
      break;
    }

    if (cursor.is("table.mw-collapsible")) {
      const element = cursor.get(0);

      if (element) {
        tables.push(element);
      }

      cursor = cursor.next();
      continue;
    }

    cursor
      .find("table.mw-collapsible")
      .each((_, element) => {
        tables.push(element);
      });
    cursor = cursor.next();
  }

  return tables;
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

    const tables = findRoundTables($, roundId);

    if (tables.length === 0) {
      continue;
    }

    for (const table of tables) {
      const rows = $(table as any).find("tbody > tr").toArray();

      for (let index = 0; index < rows.length - 1; index += 2) {
        const infoRow = $(rows[index]!);

        if (!SCORE_PATTERN.test(infoRow.text())) {
          continue;
        }

        const cells = infoRow.children("td");
        const dateText = cells.eq(0).text().trim();
        const homeTeamName = normalizeWikipediaTeamName(
          firstNonEmptyLinkText($, cells.eq(1)),
        );
        const awayTeamName = normalizeWikipediaTeamName(
          firstNonEmptyLinkText($, cells.eq(3)),
        );

        if (!homeTeamName || !awayTeamName) {
          continue;
        }

        matches.push({
          awayTeamName,
          dateKey: dateKeyFromText(dateText),
          dateText,
          homeTeamName,
          sectionId: `${roundId}_${teamNameEventIdSegment(homeTeamName)}_v_${teamNameEventIdSegment(awayTeamName)}`,
        });
      }
    }
  }

  return matches;
}
