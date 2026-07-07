import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type ParsedStandingsRow = {
  position: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  bonusPointsTry: number;
  bonusPointsLosing: number;
  totalPoints: number;
};

type ColumnKey =
  | "position"
  | "team"
  | "played"
  | "won"
  | "drawn"
  | "lost"
  | "pointsFor"
  | "pointsAgainst"
  | "triesFor"
  | "bonusPointsTry"
  | "bonusPointsLosing"
  | "totalPoints";

type ColumnIndexes = Partial<Record<ColumnKey, number>>;

const REQUIRED_COLUMNS: ColumnKey[] = [
  "team",
  "played",
  "won",
  "drawn",
  "lost",
  "pointsFor",
  "pointsAgainst",
  "totalPoints",
];

const COLUMN_ALIASES: Record<Exclude<ColumnKey, "triesFor">, string[]> & {
  triesFor: string[];
} = {
  bonusPointsLosing: [
    "lbp",
    "lb",
    "losingbp",
    "losingbonuspoint",
    "losingbonuspoints",
  ],
  bonusPointsTry: ["trybp", "tb", "tbp", "trybonuspoint", "trybonuspoints"],
  drawn: ["d", "drawn", "draw", "e", "je"],
  lost: ["l", "lost", "jp", "perdidos", "pp"],
  played: ["pld", "p", "played", "jj", "pj"],
  pointsAgainst: ["pa", "pc", "pointsagainst", "puntoscontra"],
  pointsFor: ["pf", "pointsfor"],
  position: ["pos", "position", "rank"],
  team: ["club", "equipo", "nation", "team"],
  totalPoints: ["pts", "points", "puntos", "totalpoints"],
  triesFor: ["tf", "triesfor", "tries"],
  won: ["g", "jg", "w", "won"],
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getCleanSelectionText(selection: ReturnType<ReturnType<typeof load>>) {
  return normalizeWhitespace(
    selection.clone().find("style, script").remove().end().text(),
  );
}

function normalizeHeader(value: string) {
  return normalizeWhitespace(value)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\b(?:v\s+t\s+e|vte)\b/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/vte$/, "");
}

function resolveColumnKey(headerText: string): ColumnKey | null {
  const normalized = normalizeHeader(headerText);

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as Array<
    [ColumnKey, string[]]
  >) {
    if (aliases.includes(normalized)) {
      return key;
    }
  }

  return null;
}

function resolveColumnIndexes(headers: string[]) {
  const indexes: ColumnIndexes = {};

  headers.forEach((header, index) => {
    const key = resolveColumnKey(header);

    if (key && indexes[key] === undefined) {
      indexes[key] = index;
    }
  });

  return indexes;
}

function hasRequiredColumns(indexes: ColumnIndexes) {
  return REQUIRED_COLUMNS.every((key) => indexes[key] !== undefined);
}

function parseInteger(value: string, context: string) {
  const normalized = normalizeWhitespace(value)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[+,]/g, "");

  if (!/^-?\d+$/.test(normalized)) {
    console.warn(
      `Skipping standings row with non-numeric ${context}: ${normalizeWhitespace(value)}`,
    );
    return null;
  }

  return Number(normalized);
}

function getCellText(
  $: ReturnType<typeof load>,
  cells: ReturnType<ReturnType<typeof load>>,
  indexes: ColumnIndexes,
  key: ColumnKey,
) {
  const index = indexes[key];

  if (index === undefined) {
    return "";
  }

  return getCleanSelectionText(cells.eq(index));
}

function parseOptionalInteger(
  $: ReturnType<typeof load>,
  cells: ReturnType<ReturnType<typeof load>>,
  indexes: ColumnIndexes,
  key: ColumnKey,
  context: string,
) {
  if (indexes[key] === undefined) {
    return 0;
  }

  return parseInteger(getCellText($, cells, indexes, key), context);
}

function parseTeamName(
  $: ReturnType<typeof load>,
  cells: ReturnType<ReturnType<typeof load>>,
  indexes: ColumnIndexes,
) {
  const index = indexes.team;

  if (index === undefined) {
    return "";
  }

  const cell = cells.eq(index);
  const linkedName = normalizeWhitespace(cell.find("a").last().text());
  const textName = normalizeWhitespace(
    cell.clone().find("style, script, sup").remove().end().text(),
  )
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();

  return linkedName || textName;
}

function parseRow(
  $: ReturnType<typeof load>,
  row: Parameters<ReturnType<typeof load>>[0],
  indexes: ColumnIndexes,
  fallbackPosition: number,
): ParsedStandingsRow | null {
  const cells = $(row).find("th, td");

  if (cells.length === 0) {
    return null;
  }

  const teamName = parseTeamName($, cells, indexes);

  if (!teamName) {
    return null;
  }

  const parsed = {
    bonusPointsLosing: parseOptionalInteger(
      $,
      cells,
      indexes,
      "bonusPointsLosing",
      `${teamName} losing bonus points`,
    ),
    bonusPointsTry: parseOptionalInteger(
      $,
      cells,
      indexes,
      "bonusPointsTry",
      `${teamName} try bonus points`,
    ),
    drawn: parseInteger(
      getCellText($, cells, indexes, "drawn"),
      `${teamName} drawn`,
    ),
    lost: parseInteger(
      getCellText($, cells, indexes, "lost"),
      `${teamName} lost`,
    ),
    played: parseInteger(
      getCellText($, cells, indexes, "played"),
      `${teamName} played`,
    ),
    pointsAgainst: parseInteger(
      getCellText($, cells, indexes, "pointsAgainst"),
      `${teamName} points against`,
    ),
    pointsFor: parseInteger(
      getCellText($, cells, indexes, "pointsFor"),
      `${teamName} points for`,
    ),
    position:
      indexes.position === undefined
        ? fallbackPosition
        : parseInteger(
            getCellText($, cells, indexes, "position"),
            `${teamName} position`,
          ),
    totalPoints: parseInteger(
      getCellText($, cells, indexes, "totalPoints"),
      `${teamName} total points`,
    ),
    triesFor: parseOptionalInteger(
      $,
      cells,
      indexes,
      "triesFor",
      `${teamName} tries for`,
    ),
    won: parseInteger(getCellText($, cells, indexes, "won"), `${teamName} won`),
  };

  if (Object.values(parsed).some((value) => value === null)) {
    return null;
  }

  return {
    bonusPointsLosing: parsed.bonusPointsLosing!,
    bonusPointsTry: parsed.bonusPointsTry!,
    drawn: parsed.drawn!,
    lost: parsed.lost!,
    played: parsed.played!,
    pointsAgainst: parsed.pointsAgainst!,
    pointsFor: parsed.pointsFor!,
    position: parsed.position!,
    teamName,
    totalPoints: parsed.totalPoints!,
    triesFor: parsed.triesFor!,
    won: parsed.won!,
  };
}

export function parseCompetitionStandingsHtml(
  html: string,
): ParsedStandingsRow[] {
  const $ = load(html);

  for (const table of $("table.wikitable").toArray()) {
    const rows = $(table).find("tr").toArray();

    for (const [headerRowIndex, row] of rows.entries()) {
      const headers = $(row)
        .find("th")
        .toArray()
        .map((header) => getCleanSelectionText($(header)));
      const indexes = resolveColumnIndexes(headers);

      if (!hasRequiredColumns(indexes)) {
        continue;
      }

      const parsedRows = rows
        .slice(headerRowIndex + 1)
        .map((dataRow, index) => parseRow($, dataRow, indexes, index + 1))
        .filter(
          (parsedRow): parsedRow is ParsedStandingsRow => parsedRow !== null,
        );

      if (parsedRows.length > 0) {
        return parsedRows;
      }
    }
  }

  console.warn("No compatible competition standings rows were found.");

  return [];
}

export async function scrapeCompetitionStandings(
  pageUrl: string,
): Promise<ParsedStandingsRow[]> {
  const response = await fetchWithPolicy(pageUrl);
  const html = await response.text();

  return parseCompetitionStandingsHtml(html);
}
