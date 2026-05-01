import * as cheerio from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type WikipediaLineupPlayer = {
  jersey_number: number;
  name: string;
};

export type WikipediaMatchLineup = {
  home_players: WikipediaLineupPlayer[];
  away_players: WikipediaLineupPlayer[];
  source_url: string;
  announced_at: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseLineupTable(
  $: cheerio.CheerioAPI,
  table: ReturnType<cheerio.CheerioAPI>,
) {
  return table
    .find("tr")
    .toArray()
    .flatMap((row) => {
      const cells = $(row).find("td");

      if (cells.length < 2) {
        return [];
      }

      const jersey = Number(normalizeWhitespace(cells.eq(0).text()));

      if (!Number.isInteger(jersey) || jersey < 1 || jersey > 23) {
        return [];
      }

      const name = normalizeWhitespace(
        cells.eq(1).find("a").first().text() || cells.eq(1).text(),
      );

      if (!name) {
        return [];
      }

      return [{ jersey_number: jersey, name }];
    });
}

export function parseWikipediaLineupHtml(
  html: string,
  sourceUrl: string,
): WikipediaMatchLineup | null {
  const $ = cheerio.load(html);
  const section = $("#Line-ups, #Line-ups_and_bench, #Lineups")
    .first()
    .closest("h2, h3");

  if (section.length === 0) {
    return null;
  }

  const tables: Array<ReturnType<typeof $>> = [];
  let cursor = section.next();

  while (cursor.length > 0) {
    if (cursor.is("h2, h3")) {
      break;
    }

    if (cursor.is("table.wikitable")) {
      tables.push(cursor);
    }

    cursor = cursor.next();
  }

  if (tables.length < 2) {
    return null;
  }

  const homePlayers = parseLineupTable($, tables[0]!);
  const awayPlayers = parseLineupTable($, tables[1]!);

  if (homePlayers.length === 0 && awayPlayers.length === 0) {
    return null;
  }

  return {
    announced_at: new Date().toISOString(),
    away_players: awayPlayers,
    home_players: homePlayers,
    source_url: sourceUrl,
  };
}

/**
 * Extracts home and away lineups from a Six Nations season-page vevent block.
 *
 * The vevent wikitables are ordered as:
 *   0. score table
 *   1. home lineup table
 *   2. away lineup table
 */
export function parseLineupFromVeventHtml(
  veventHtml: string,
  sourceUrl: string,
): WikipediaMatchLineup | null {
  const $ = cheerio.load(veventHtml);
  const tables = $("table.wikitable");

  if (tables.length < 3) {
    return null;
  }

  const homePlayers = parseLineupTable($, tables.eq(1));
  const awayPlayers = parseLineupTable($, tables.eq(2));

  if (homePlayers.length === 0 && awayPlayers.length === 0) {
    return null;
  }

  return {
    announced_at: new Date().toISOString(),
    away_players: awayPlayers,
    home_players: homePlayers,
    source_url: sourceUrl,
  };
}

export async function scrapeMatchLineup(
  matchPageUrl: string,
): Promise<WikipediaMatchLineup | null> {
  const response = await fetchWithPolicy(matchPageUrl);
  const html = await response.text();

  return parseWikipediaLineupHtml(html, matchPageUrl);
}
