import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";
import { extractWikipediaRcMatchFragment } from "@/lib/scrapers/wikipedia-rc-season-parser";

import type { WikipediaClubMatchDetails } from "@/lib/scrapers/wikipedia-club-match-details";
import type { WikipediaLineupPlayer } from "@/lib/scrapers/wikipedia-lineups";
import type {
  ParsedMatchEvent,
  ParsedPlayerMatchEvent,
} from "@/lib/scrapers/wikipedia-match-events";

type TeamSide = ParsedMatchEvent["teamSide"];
type MatchEventType = ParsedPlayerMatchEvent["type"];

const SCORE_PATTERN = /\b\d+\s*[–-]\s*\d+\b/;

const LABEL_TO_TYPE: Record<string, MatchEventType> = {
  con: "conversion",
  cons: "conversion",
  dg: "drop_goal",
  drop: "drop_goal",
  pen: "penalty_goal",
  pens: "penalty_goal",
  tries: "try",
  try: "try",
};

const POSITION_NUMBER: Record<string, number> = {
  BF: 6,
  FB: 15,
  FH: 10,
  HK: 2,
  IC: 12,
  LL: 4,
  LP: 1,
  LW: 11,
  N8: 8,
  OC: 13,
  OF: 7,
  RL: 5,
  RW: 14,
  SH: 9,
  TP: 3,
};

function cleanText(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseScoringText(
  text: string,
  teamSide: TeamSide,
): ParsedMatchEvent[] {
  const events: ParsedMatchEvent[] = [];
  const labelPattern = /\b(Try|Tries|Con|Cons|Pen|Pens|DG|Drop):/gi;
  const labels = [...text.matchAll(labelPattern)];

  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index]!;
    const nextLabel = labels[index + 1];
    const rawLabel = label[1]?.toLowerCase() ?? "";
    const type = LABEL_TO_TYPE[rawLabel];

    if (!type) {
      continue;
    }

    const segment = text.slice(
      (label.index ?? 0) + label[0].length,
      nextLabel?.index ?? text.length,
    );

    for (const entry of segment.split(/,\s*(?=[^,()]+?\()/)) {
      const matched = entry.match(/(.+?)\s*\(([^)]*)\)/);

      if (!matched) {
        continue;
      }

      const playerName = cleanText(matched[1] ?? "");
      const parsedMinutes = [
        ...(matched[2] ?? "").matchAll(/(\d{1,3})(?:\+\d{1,2})?\s*'/g),
      ].map((minuteMatch) => Number(minuteMatch[1]));
      const resolvedMinutes: Array<number | null> =
        parsedMinutes.length > 0 ? parsedMinutes : [null];

      if (!playerName) {
        continue;
      }

      for (const minute of resolvedMinutes) {
        events.push({
          isPenaltyTry: false,
          minute,
          playerName,
          teamSide,
          type,
        });
      }
    }
  }

  return events;
}

function parseRcMatchEvents(fragmentHtml: string): ParsedMatchEvent[] {
  const $ = load(fragmentHtml);
  let homeColIndex = -1;
  let awayColIndex = -1;

  for (const row of $("tr").toArray()) {
    const cells = $(row).children("td, th");
    const scoreIndex = cells
      .toArray()
      .findIndex((cell) => SCORE_PATTERN.test(cleanText($(cell).text())));

    if (scoreIndex > 0 && scoreIndex < cells.length - 1) {
      homeColIndex = scoreIndex - 1;
      awayColIndex = scoreIndex + 1;
      break;
    }
  }

  if (homeColIndex < 0) {
    return parseScoringText(cleanText($.text()), "home");
  }

  let homeText = "";
  let awayText = "";

  for (const row of $("tr").toArray()) {
    const cells = $(row).children("td, th").toArray();
    const homeCellText = cleanText($(cells[homeColIndex] ?? "").text());
    const awayCellText = cleanText($(cells[awayColIndex] ?? "").text());

    if (/\b(?:Try|Tries|Con|Cons|Pen|Pens|DG|Drop):/i.test(homeCellText)) {
      homeText = homeCellText;
    }

    if (/\b(?:Try|Tries|Con|Cons|Pen|Pens|DG|Drop):/i.test(awayCellText)) {
      awayText = awayCellText;
    }
  }

  return [
    ...parseScoringText(homeText, "home"),
    ...parseScoringText(awayText, "away"),
  ];
}

function playerNameFromCell(
  $: ReturnType<typeof load>,
  cell: ReturnType<ReturnType<typeof load>>,
): string | null {
  const linkText = cleanText(cell.find("a").first().text());
  const text = cleanText(cell.text());

  return linkText || text || null;
}

function parseRcLineup(fragmentHtml: string, sourceUrl: string) {
  const $ = load(fragmentHtml);
  const homePlayers: WikipediaLineupPlayer[] = [];
  const awayPlayers: WikipediaLineupPlayer[] = [];

  $("tr").each((_, row) => {
    const cells = $(row).children("td, th");
    const positionIndex = cells
      .toArray()
      .findIndex(
        (cell) => POSITION_NUMBER[cleanText($(cell).text()).toUpperCase()],
      );

    if (positionIndex < 0) {
      return;
    }

    const jerseyNumber =
      POSITION_NUMBER[cleanText(cells.eq(positionIndex).text()).toUpperCase()];

    if (!jerseyNumber) {
      return;
    }

    const before = cells.slice(0, positionIndex).toArray().reverse();
    const after = cells.slice(positionIndex + 1).toArray();
    const homeName = before
      .map((cell) => playerNameFromCell($, $(cell)))
      .find((name): name is string => Boolean(name));
    const awayName = after
      .map((cell) => playerNameFromCell($, $(cell)))
      .find((name): name is string => Boolean(name));

    if (homeName) {
      homePlayers.push({ jersey_number: jerseyNumber, name: homeName });
    }

    if (awayName) {
      awayPlayers.push({ jersey_number: jerseyNumber, name: awayName });
    }
  });

  if (homePlayers.length === 0 && awayPlayers.length === 0) {
    return null;
  }

  return {
    announced_at: new Date().toISOString(),
    away_players: homePlayers.length > 0 ? awayPlayers : [],
    home_players: homePlayers,
    source_url: sourceUrl,
  };
}

export function parseWikipediaRcMatchDetailsHtml(
  html: string,
  source: { eventId: string | null; url: string },
): WikipediaClubMatchDetails {
  const fragment = extractWikipediaRcMatchFragment(html, source.eventId);

  if (!fragment) {
    return { events: [], lineup: null };
  }

  return {
    events: parseRcMatchEvents(fragment),
    lineup: parseRcLineup(fragment, source.url),
  };
}

export async function scrapeWikipediaRcMatchDetails(source: {
  eventId: string | null;
  url: string;
}): Promise<WikipediaClubMatchDetails> {
  const response = await fetchWithPolicy(source.url);
  const html = await response.text();

  return parseWikipediaRcMatchDetailsHtml(html, source);
}
