import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

const JRFU_BASE_URL = "https://www.rugby-japan.jp/";

const EVENT_TYPE_BY_ICON = {
  "icon-conversion": "conversion",
  "icon-dg": "drop_goal",
  "icon-pg": "penalty_goal",
  "icon-try": "try",
} as const;

type JrfuEventType =
  (typeof EVENT_TYPE_BY_ICON)[keyof typeof EVENT_TYPE_BY_ICON];

export type JrfuMatchEventParseResult = {
  events: ParsedMatchEvent[];
  hasUnsupportedScoringEvent: boolean;
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseMinute(value: string): number | null {
  const match = normalizeText(value).match(/^(\d{1,3})'/);

  return match?.[1] ? Number(match[1]) : null;
}

function parseTimelineScore(value: string): [number, number] | null {
  const scores = normalizeText(value)
    .split("-")
    .map((part) => part.trim())
    .map((part) => (/^\d+$/.test(part) ? Number(part) : null));

  const [homeScore, awayScore] = scores;

  if (
    homeScore === undefined ||
    awayScore === undefined ||
    homeScore === null ||
    awayScore === null
  ) {
    return null;
  }

  return [homeScore, awayScore];
}

function eventTypeFromClassName(className: string): JrfuEventType | null {
  for (const [iconClass, eventType] of Object.entries(EVENT_TYPE_BY_ICON)) {
    if (className.split(/\s+/).includes(iconClass)) {
      return eventType;
    }
  }

  return null;
}

function isPenaltyTryLabel(value: string) {
  return /penalty\s*try|ペナルティ\s*トライ|認定\s*トライ/i.test(value);
}

// JRFU exposes scoring type as an icon-* class on each timeline entry. The
// page's icon legend names icon-try, icon-conversion, icon-pg and icon-dg;
// unrecognised indicators are kept out of the insert path.
export function parseJrfuMatchEventsHtml(
  html: string,
): JrfuMatchEventParseResult {
  const $ = load(html);
  const events: ParsedMatchEvent[] = [];
  let hasUnsupportedScoringEvent = false;
  let previousScore: [number, number] | null = null;

  $("#timeline .timeline tbody tr").each((_, row) => {
    const score = parseTimelineScore($(row).find(".score").first().text());
    const scoreChanged =
      score !== null &&
      previousScore !== null &&
      (score[0] !== previousScore[0] || score[1] !== previousScore[1]);

    if (score !== null) {
      previousScore = score;
    }

    const entry = $(row).find("td > div[class*='icon-']").first();

    if (!entry.length) {
      if (scoreChanged) {
        hasUnsupportedScoringEvent = true;
      }
      return;
    }

    const type = eventTypeFromClassName(entry.attr("class") ?? "");
    const playerName = normalizeText(entry.find("a").first().text());
    const entryText = normalizeText(entry.text());

    if (type === null) {
      if (scoreChanged) {
        hasUnsupportedScoringEvent = true;
      }
      return;
    }

    // A penalty try must never be silently represented as an ordinary try.
    // The timeline labels it separately from the player name when present,
    // so leave the entire match untouched until that format is supported.
    if (type === "try" && isPenaltyTryLabel(entryText)) {
      hasUnsupportedScoringEvent = true;
      return;
    }

    const teamSide = entry.hasClass("home")
      ? "home"
      : entry.hasClass("away")
        ? "away"
        : null;

    if (teamSide === null || playerName.length === 0) {
      if (scoreChanged) {
        hasUnsupportedScoringEvent = true;
      }
      return;
    }

    events.push({
      isPenaltyTry: false,
      minute: parseMinute(entry.closest("tr").find(".time").first().text()),
      playerName,
      source: "jrfu",
      teamSide,
      type,
    });
  });

  return { events, hasUnsupportedScoringEvent };
}

export function normalizeJrfuMatchUrl(url: string): string {
  const normalized = new URL(url, JRFU_BASE_URL);

  if (
    normalized.protocol !== "https:" ||
    !["rugby-japan.jp", "www.rugby-japan.jp"].includes(normalized.hostname)
  ) {
    throw new Error(`Unexpected JRFU match URL: ${url}`);
  }

  normalized.hostname = "www.rugby-japan.jp";
  return normalized.toString();
}

export async function fetchJrfuMatchEvents(
  url: string,
): Promise<JrfuMatchEventParseResult> {
  const sourceUrl = normalizeJrfuMatchUrl(url);
  const response = await fetchWithPolicy(sourceUrl);

  return parseJrfuMatchEventsHtml(await response.text());
}
