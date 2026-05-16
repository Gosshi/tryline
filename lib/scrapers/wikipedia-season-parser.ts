import { load } from "cheerio";
import { parse } from "date-fns";

import { normalizeWikipediaTeamName } from "@/lib/scrapers/wikipedia-team-name-map";

export type WikipediaSeasonMatch = {
  awayTeamName: string;
  dateKey: string | null;
  dateText: string | null;
  homeTeamName: string;
  sectionId: string | null;
};

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;
const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}/;
const DATE_FORMATS = [
  "d MMMM yyyy",
  "dd MMMM yyyy",
  "MMMM d, yyyy",
  "d MMM yyyy",
  "dd MMM yyyy",
];

function cleanText(text: string): string {
  return text.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function toDateKey(dateText: string | null): string | null {
  if (!dateText) {
    return null;
  }

  const isoMatch = dateText.match(ISO_DATE_PATTERN);

  if (isoMatch) {
    return isoMatch[0] ?? null;
  }

  const firstLine = dateText.split(/\n|<br\s*\/?>/i)[0]?.trim() ?? dateText;

  for (const format of DATE_FORMATS) {
    const parsed = parse(firstLine, format, new Date(Date.UTC(2000, 0, 1)));

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const nativeParsed = new Date(firstLine);

  return Number.isNaN(nativeParsed.getTime())
    ? null
    : nativeParsed.toISOString().slice(0, 10);
}

function extractDateText(
  $: ReturnType<typeof load>,
  event: ReturnType<ReturnType<typeof load>>,
): string | null {
  const dateElement = event.find("time, abbr.dtstart").first();
  const dateText =
    dateElement.attr("datetime") ??
    dateElement.attr("title") ??
    cleanText(dateElement.text());

  if (dateText) {
    return dateText;
  }

  const dateCellText = cleanText(event.find("table").first().text());

  return dateCellText || null;
}

function extractTeamsFromVcards(
  $: ReturnType<typeof load>,
  event: ReturnType<ReturnType<typeof load>>,
): [string, string] | null {
  const teamNames = event
    .find(".vcard, .fn")
    .map((_, element) => {
      const raw = cleanText($(element).text());

      return raw.replace(/\(\d+\)/g, "").trim();
    })
    .get()
    .filter(Boolean);

  if (teamNames.length >= 2) {
    return [teamNames[0]!, teamNames[teamNames.length - 1]!];
  }

  return null;
}

function extractTeamsFromRows(
  $: ReturnType<typeof load>,
  event: ReturnType<ReturnType<typeof load>>,
): [string, string] | null {
  for (const row of event.find("tr").toArray()) {
    const cells = $(row)
      .children("td, th")
      .map((_, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length >= 3 && cells.some((cell) => SCORE_PATTERN.test(cell))) {
      return [cells[0]!, cells[cells.length - 1]!];
    }

    const linkedCells = $(row)
      .children("td, th")
      .map((_, cell) => {
        const linkText = cleanText($(cell).find("a").first().text());

        return linkText || cleanText($(cell).text());
      })
      .get()
      .filter(Boolean);

    if (
      linkedCells.length >= 3 &&
      linkedCells.some((cell) => SCORE_PATTERN.test(cell))
    ) {
      return [linkedCells[0]!, linkedCells[linkedCells.length - 1]!];
    }
  }

  return null;
}

function extractTeams(
  $: ReturnType<typeof load>,
  event: ReturnType<ReturnType<typeof load>>,
): [string, string] | null {
  return extractTeamsFromVcards($, event) ?? extractTeamsFromRows($, event);
}

export function parseWikipediaSeasonMatches(
  html: string,
): WikipediaSeasonMatch[] {
  const $ = load(html);
  const matches: WikipediaSeasonMatch[] = [];
  const GENERIC_CONTAINER_IDS = new Set([
    "mw-content-text",
    "bodyContent",
    "content",
    "mw-body",
    "mw-body-content",
  ]);

  $("div.vevent").each((_, element) => {
    const event = $(element);
    const teams = extractTeams($, event);

    if (!teams) {
      return;
    }

    const homeTeamName = normalizeWikipediaTeamName(teams[0]);
    const awayTeamName = normalizeWikipediaTeamName(teams[1]);
    const dateText = extractDateText($, event);

    matches.push({
      awayTeamName,
      dateKey: toDateKey(dateText),
      dateText,
      homeTeamName,
      sectionId:
        event.attr("id") ??
        event
          .parents("[id]")
          .filter(
            (_, parent) => !GENERIC_CONTAINER_IDS.has($(parent).attr("id") ?? ""),
          )
          .first()
          .attr("id") ??
        null,
    });
  });

  return matches;
}
