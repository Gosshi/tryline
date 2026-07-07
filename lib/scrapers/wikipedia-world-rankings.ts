import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type ParsedRankingRow = {
  points: number;
  rank: number;
  teamName: string;
};

type RankingColumnKey = "points" | "rank" | "team";
type RankingColumnIndexes = Partial<Record<RankingColumnKey, number>>;

export const WORLD_RUGBY_RANKINGS_URL =
  "https://en.wikipedia.org/wiki/World_Rugby_Rankings";

const REQUIRED_COLUMNS: RankingColumnKey[] = ["points", "rank", "team"];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function resolveColumnKey(headerText: string): RankingColumnKey | null {
  const normalized = normalizeHeader(headerText);

  if (["rank", "ranking", "pos", "position"].includes(normalized)) {
    return "rank";
  }

  if (["team", "nation", "country"].includes(normalized)) {
    return "team";
  }

  if (["points", "pts", "rating", "ratingpoints"].includes(normalized)) {
    return "points";
  }

  return null;
}

function resolveColumnIndexes(headers: string[]) {
  const indexes: RankingColumnIndexes = {};

  headers.forEach((header, index) => {
    const key = resolveColumnKey(header);

    if (key && indexes[key] === undefined) {
      indexes[key] = index;
    }
  });

  return indexes;
}

function hasRequiredColumns(indexes: RankingColumnIndexes) {
  return REQUIRED_COLUMNS.every((key) => indexes[key] !== undefined);
}

function parseNumber(value: string, context: string) {
  const normalized = normalizeWhitespace(value)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[+,]/g, "");

  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    console.warn(
      `Skipping rankings row with non-numeric ${context}: ${normalizeWhitespace(value)}`,
    );
    return null;
  }

  return Number(normalized);
}

function getCellText(
  cells: ReturnType<ReturnType<typeof load>>,
  indexes: RankingColumnIndexes,
  key: RankingColumnKey,
) {
  const index = indexes[key];

  if (index === undefined) {
    return "";
  }

  return normalizeWhitespace(cells.eq(index).text());
}

function parseTeamName(
  $: ReturnType<typeof load>,
  cells: ReturnType<ReturnType<typeof load>>,
  indexes: RankingColumnIndexes,
) {
  const index = indexes.team;

  if (index === undefined) {
    return "";
  }

  const cell = cells.eq(index);
  const linkedName = normalizeWhitespace(
    cell
      .find("a")
      .filter((_, element) => normalizeWhitespace($(element).text()) !== "")
      .last()
      .text(),
  );
  const textName = normalizeWhitespace(
    cell.clone().children("sup, span.flagicon").remove().end().text(),
  )
    .replace(/\[[^\]]+\]/g, "")
    .trim();

  return linkedName || textName;
}

export function parseWorldRugbyRankingsHtml(html: string): ParsedRankingRow[] {
  const $ = load(html);

  for (const table of $("table.wikitable").toArray()) {
    const rows = $(table).find("tr").toArray();

    for (const [headerRowIndex, row] of rows.entries()) {
      const headers = $(row)
        .find("th")
        .map((_, header) => $(header).text())
        .get();

      const indexes = resolveColumnIndexes(headers);

      if (!hasRequiredColumns(indexes)) {
        continue;
      }

      const parsedRows = rows
        .slice(headerRowIndex + 1)
        .map((candidate) => {
          const cells = $(candidate).find("th, td");

          if (cells.length === 0) {
            return null;
          }

          const teamName = parseTeamName($, cells, indexes);

          if (!teamName) {
            return null;
          }

          const rank = parseNumber(
            getCellText(cells, indexes, "rank"),
            `${teamName} rank`,
          );
          const points = parseNumber(
            getCellText(cells, indexes, "points"),
            `${teamName} points`,
          );

          if (rank === null || points === null) {
            return null;
          }

          return {
            points,
            rank,
            teamName,
          };
        })
        .filter((row): row is ParsedRankingRow => row !== null);

      if (parsedRows.length > 0) {
        return parsedRows;
      }
    }
  }

  console.warn("No compatible World Rugby rankings rows were found.");
  return [];
}

export async function scrapeWorldRugbyRankings(
  url = WORLD_RUGBY_RANKINGS_URL,
): Promise<ParsedRankingRow[]> {
  const response = await fetchWithPolicy(url);
  const html = await response.text();

  return parseWorldRugbyRankingsHtml(html);
}
