import { load } from "cheerio";
import { format, parse } from "date-fns";

import {
  normalizeWikipediaTeamName,
  RC_WIKIPEDIA_TEAM_NAMES,
} from "@/lib/scrapers/wikipedia-team-name-map";

import type { WikipediaSeasonMatch } from "@/lib/scrapers/wikipedia-season-parser";

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;
const ISO_DATE_PATTERN = /\d{4}-\d{2}-\d{2}/;
const TEXT_DATE_PATTERN =
  /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i;
const DATE_FORMATS = ["d MMMM yyyy", "dd MMMM yyyy"];

function cleanText(text: string): string {
  return text.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function dateKeyFromText(text: string): string | null {
  const isoMatch = text.match(ISO_DATE_PATTERN);

  if (isoMatch) {
    return isoMatch[0] ?? null;
  }

  const dateMatch = text.match(TEXT_DATE_PATTERN);
  const dateText = dateMatch?.[0];

  if (!dateText) {
    return null;
  }

  for (const dateFormat of DATE_FORMATS) {
    const parsed = parse(dateText, dateFormat, new Date(Date.UTC(2000, 0, 1)));

    if (!Number.isNaN(parsed.getTime())) {
      return format(parsed, "yyyy-MM-dd");
    }
  }

  return null;
}

function collectRoundFragments(html: string, roundId: string): string[] {
  const $ = load(html);
  const heading = $(`#${roundId}`).first();

  if (!heading.length) {
    return [];
  }

  const start = heading.parent(".mw-heading").length
    ? heading.parent()
    : heading;
  const fragments: string[] = [];
  let current: string[] = [];
  let cursor = start.next();

  while (cursor.length > 0) {
    if (cursor.is("h3, .mw-heading") && cursor.find("h3[id^='Round_']").length) {
      break;
    }

    if (cursor.is("h2, .mw-heading") && cursor.find("h2").length) {
      break;
    }

    if (cursor.is("hr")) {
      if (current.length > 0) {
        fragments.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push($.html(cursor) ?? "");
    }

    cursor = cursor.next();
  }

  if (current.length > 0) {
    fragments.push(current.join("\n"));
  }

  return fragments.filter((fragment) => SCORE_PATTERN.test(cleanText(load(fragment).text())));
}

function extractTeamsFromScoreRow(fragmentHtml: string): [string, string] | null {
  const $ = load(fragmentHtml);

  for (const row of $("tr").toArray()) {
    const cells = $(row).children("td, th");
    const scoreIndex = cells
      .toArray()
      .findIndex((cell) => SCORE_PATTERN.test(cleanText($(cell).text())));

    if (scoreIndex > 0 && scoreIndex < cells.length - 1) {
      const home = cleanText(cells.eq(scoreIndex - 1).find("a").first().text() || cells.eq(scoreIndex - 1).text());
      const away = cleanText(cells.eq(scoreIndex + 1).find("a").first().text() || cells.eq(scoreIndex + 1).text());

      if (home && away) {
        return [home, away];
      }
    }
  }

  return null;
}

function extractTeamsFromKnownLinks(fragmentHtml: string): [string, string] | null {
  const $ = load(fragmentHtml);
  const names = $("a")
    .map((_, link) => cleanText($(link).text()))
    .get()
    .filter((name) => RC_WIKIPEDIA_TEAM_NAMES.includes(name));
  const unique = [...new Set(names)];

  return unique.length >= 2 ? [unique[0]!, unique[1]!] : null;
}

function extractTeams(fragmentHtml: string): [string, string] | null {
  return (
    extractTeamsFromScoreRow(fragmentHtml) ??
    extractTeamsFromKnownLinks(fragmentHtml)
  );
}

function roundNumberFromId(roundId: string): number | null {
  const match = roundId.match(/^Round_(\d+)$/);

  return match ? Number(match[1]) : null;
}

export function parseWikipediaRcSeasonMatches(
  html: string,
): WikipediaSeasonMatch[] {
  const $ = load(html);
  const matches: WikipediaSeasonMatch[] = [];
  const roundIds = $("h3[id^='Round_']")
    .map((_, heading) => $(heading).attr("id"))
    .get()
    .filter((id): id is string => Boolean(id))
    .sort((left, right) => (roundNumberFromId(left) ?? 0) - (roundNumberFromId(right) ?? 0));

  for (const roundId of roundIds) {
    const fragments = collectRoundFragments(html, roundId);

    fragments.forEach((fragment, matchIndex) => {
      const teams = extractTeams(fragment);

      if (!teams) {
        return;
      }

      const text = cleanText(load(fragment).text());

      matches.push({
        awayTeamName: normalizeWikipediaTeamName(teams[1]),
        dateKey: dateKeyFromText(text),
        dateText: text.match(ISO_DATE_PATTERN)?.[0] ?? text.match(TEXT_DATE_PATTERN)?.[0] ?? null,
        homeTeamName: normalizeWikipediaTeamName(teams[0]),
        sectionId: `${roundId}_${matchIndex}`,
      });
    });
  }

  return matches;
}

export function extractWikipediaRcMatchFragment(
  html: string,
  eventId: string | null,
): string | null {
  const match = eventId?.match(/^(Round_\d+)_(\d+)$/);

  if (!match) {
    return null;
  }

  const [, roundId, indexText] = match;
  const matchIndex = Number(indexText);
  const fragments = collectRoundFragments(html, roundId!);

  return fragments[matchIndex] ?? null;
}
