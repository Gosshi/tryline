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
 * Extracts home and away lineups from the table immediately after a Six Nations
 * season-page vevent block.
 *
 * Row 0 and empty rows are skipped. Player rows are detected by td[1] being a
 * jersey number from 1 to 23. The away side starts at the second jersey 15.
 */
export function parseLineupFromTableHtml(
  tableHtml: string,
  sourceUrl: string,
): WikipediaMatchLineup | null {
  const $ = cheerio.load(tableHtml);
  const homePlayers: WikipediaLineupPlayer[] = [];
  const awayPlayers: WikipediaLineupPlayer[] = [];
  let parsingAway = false;
  let seenJersey15 = false;

  $("table tr").each((_, row) => {
    const cells = $(row).find("td");

    if (cells.length > 10 || cells.length < 3) {
      return;
    }

    const jerseyText = normalizeWhitespace(cells.eq(1).text());
    const jersey = Number(jerseyText);

    if (!Number.isInteger(jersey) || jersey < 1 || jersey > 23) {
      return;
    }

    if (jersey === 15) {
      if (seenJersey15) {
        parsingAway = true;
      } else {
        seenJersey15 = true;
      }
    }

    const name = normalizeWhitespace(
      cells.eq(2).find("a").first().text() || cells.eq(2).text(),
    );

    if (!name) {
      return;
    }

    const player = { jersey_number: jersey, name };

    if (parsingAway) {
      awayPlayers.push(player);
    } else {
      homePlayers.push(player);
    }
  });

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
