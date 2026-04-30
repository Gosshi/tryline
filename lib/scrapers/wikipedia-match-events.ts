import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type ParsedMatchEvent = {
  type: "try" | "conversion" | "penalty_goal" | "drop_goal" | "yellow_card" | "red_card";
  minute: number | null;
  teamSide: "home" | "away";
  playerName: string;
  isPenaltyTry: boolean;
};

type MatchEventType = ParsedMatchEvent["type"];
type TeamSide = ParsedMatchEvent["teamSide"];

export const WIKIPEDIA_TEAM_NAME_BY_DB_NAME: Record<string, string> = {
  england: "England",
  france: "France",
  ireland: "Ireland",
  italy: "Italy",
  scotland: "Scotland",
  wales: "Wales",
};

const EVENT_TYPE_BY_LABEL: Record<string, MatchEventType> = {
  "drop goals": "drop_goal",
  cons: "conversion",
  conversions: "conversion",
  pens: "penalty_goal",
  penalties: "penalty_goal",
  "penalty goals": "penalty_goal",
  "red cards": "red_card",
  tries: "try",
  "yellow cards": "yellow_card",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string) {
  return normalizeWhitespace(value)
    .replace(/:$/, "")
    .toLowerCase();
}

function normalizePlayerName(value: string) {
  return normalizeWhitespace(value)
    .replace(/\(pen\)/gi, "")
    .replace(/\bpenalty try\b/gi, "Penalty try")
    .replace(/^[,;]+|[,;]+$/g, "")
    .trim();
}

function isEmptyEventText(value: string) {
  const normalized = normalizeWhitespace(value).toLowerCase();

  return (
    normalized === "" ||
    normalized === "none" ||
    normalized === "n/a" ||
    normalized === "-" ||
    normalized === "–" ||
    normalized === "—"
  );
}

function textWithoutReferences(html: string) {
  const $ = load(html);

  $("sup.reference, .reference, style, script").remove();

  return normalizeWhitespace($.root().text().replace(/\[[^\]]+\]/g, ""));
}

function parseMinutes(value: string) {
  const minutes = [...value.matchAll(/(\d{1,3})(?:\+\d{1,2})?\s*'/g)].map(
    (match) => Number(match[1]),
  );

  return minutes.length > 0 ? minutes : [null];
}

function parseEventCell(
  cellText: string,
  type: MatchEventType,
  teamSide: TeamSide,
): ParsedMatchEvent[] {
  if (isEmptyEventText(cellText)) {
    return [];
  }

  const matches = [...cellText.matchAll(/([^()]+?)\s*\(([^)]*)\)/g)];

  if (matches.length === 0) {
    return cellText
      .split(/[,;]/)
      .map((part) => normalizePlayerName(part))
      .filter(Boolean)
      .map((playerName) => ({
        isPenaltyTry: type === "try" && /penalty try/i.test(playerName),
        minute: null,
        playerName,
        teamSide,
        type,
      }));
  }

  return matches.flatMap((match, index) => {
    const rawName = match[1] ?? "";
    const rawMinutes = match[2] ?? "";
    const segmentStart = match.index ?? 0;
    const segmentEnd = matches[index + 1]?.index ?? cellText.length;
    const segment = cellText.slice(segmentStart, segmentEnd);
    const isPenaltyTry =
      type === "try" && (/\bpen\b/i.test(segment) || /penalty try/i.test(segment));
    const playerName = normalizePlayerName(rawName) || "Penalty try";

    if (!/\d/.test(rawMinutes) && normalizePlayerName(rawName) === "") {
      return [];
    }

    return parseMinutes(rawMinutes).map((minute) => ({
      isPenaltyTry,
      minute,
      playerName,
      teamSide,
      type,
    }));
  });
}

export function parseWikipediaMatchEventsHtml(html: string): ParsedMatchEvent[] {
  const $ = load(html);
  const rows = $("table.infobox tr, table.vevent tr");
  const events: ParsedMatchEvent[] = [];

  rows.each((_, row) => {
    const cells = $(row).children("th, td");

    if (cells.length < 3) {
      return;
    }

    const label = normalizeLabel($(cells[0]).text());
    const type = EVENT_TYPE_BY_LABEL[label];

    if (!type) {
      return;
    }

    const homeText = textWithoutReferences($.html(cells[1]) ?? "");
    const awayText = textWithoutReferences($.html(cells[2]) ?? "");

    events.push(...parseEventCell(homeText, type, "home"));
    events.push(...parseEventCell(awayText, type, "away"));
  });

  return events;
}

function resolveWikipediaTeamName(dbTeamName: string) {
  const resolved = WIKIPEDIA_TEAM_NAME_BY_DB_NAME[normalizeWhitespace(dbTeamName).toLowerCase()];

  if (!resolved) {
    throw new Error(`Unknown Six Nations team name for Wikipedia URL: ${dbTeamName}`);
  }

  return resolved;
}

export function buildMatchWikipediaUrl(params: {
  year: string;
  homeTeamName: string;
  awayTeamName: string;
}): string {
  // Note: this follows the spec URL shape, but real Six Nations 2024 match
  // pages checked during implementation all returned 404. If this keeps
  // happening for target seasons, revisit the data source before relying on
  // match_events population.
  const homeTeamName = resolveWikipediaTeamName(params.homeTeamName);
  const awayTeamName = resolveWikipediaTeamName(params.awayTeamName);
  const title = `${params.year}_Six_Nations_Championship_–_${homeTeamName}_v_${awayTeamName}`;

  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
}

export async function scrapeMatchEvents(matchUrl: string): Promise<ParsedMatchEvent[]> {
  try {
    const response = await fetchWithPolicy(matchUrl);
    const html = await response.text();
    const events = parseWikipediaMatchEventsHtml(html);

    if (events.length === 0) {
      console.warn(`No match events found in Wikipedia infobox: ${matchUrl}`);
    }

    return events;
  } catch (error) {
    console.warn(`Unable to scrape match events from ${matchUrl}`, error);
    return [];
  }
}
