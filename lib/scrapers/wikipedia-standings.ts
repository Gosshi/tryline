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
  "position",
  "team",
  "played",
  "won",
  "drawn",
  "lost",
  "pointsFor",
  "pointsAgainst",
  "bonusPointsTry",
  "bonusPointsLosing",
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
  drawn: ["d", "drawn", "draw"],
  lost: ["l", "lost"],
  played: ["pld", "p", "played"],
  pointsAgainst: ["pa", "pointsagainst"],
  pointsFor: ["pf", "pointsfor"],
  position: ["pos", "position", "rank"],
  team: ["team", "nation"],
  totalPoints: ["pts", "points", "totalpoints"],
  triesFor: ["tf", "triesfor", "tries"],
  won: ["w", "won"],
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-z0-9]+/g, "");
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
  const normalized = normalizeWhitespace(value).replace(/[+,]/g, "");

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

  return normalizeWhitespace(cells.eq(index).text());
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
    cell.clone().children("sup").remove().end().text(),
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
    bonusPointsLosing: parseInteger(
      getCellText($, cells, indexes, "bonusPointsLosing"),
      `${teamName} losing bonus points`,
    ),
    bonusPointsTry: parseInteger(
      getCellText($, cells, indexes, "bonusPointsTry"),
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
    position: parseInteger(
      getCellText($, cells, indexes, "position"),
      `${teamName} position`,
    ),
    totalPoints: parseInteger(
      getCellText($, cells, indexes, "totalPoints"),
      `${teamName} total points`,
    ),
    triesFor:
      indexes.triesFor === undefined
        ? 0
        : parseInteger(
            getCellText($, cells, indexes, "triesFor"),
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
        .map((header) => normalizeWhitespace($(header).text()));
      const indexes = resolveColumnIndexes(headers);

      if (!hasRequiredColumns(indexes)) {
        continue;
      }

      const parsedRows = rows
        .slice(headerRowIndex + 1)
        .map((dataRow) => parseRow($, dataRow, indexes))
        .filter(
          (parsedRow): parsedRow is ParsedStandingsRow => parsedRow !== null,
        );

      if (parsedRows.length > 0) {
        if (parsedRows.length !== 6) {
          console.warn(
            `Expected 6 competition standings rows, parsed ${parsedRows.length}.`,
          );
        }

        return parsedRows;
      }
    }
  }

  console.warn("Expected 6 competition standings rows, parsed 0.");

  return [];
}

export async function scrapeCompetitionStandings(
  pageUrl: string,
): Promise<ParsedStandingsRow[]> {
  const response = await fetchWithPolicy(pageUrl);
  const html = await response.text();

  return parseCompetitionStandingsHtml(html);
}
