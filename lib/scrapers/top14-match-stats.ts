import { load } from "cheerio";

import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

export type Top14TeamStats = {
  carries?: number;
  errors?: number;
  lineouts_total?: number;
  lineouts_won?: number;
  penalties_conceded?: number;
  possession_pct?: number;
  red_cards?: number;
  scrums_total?: number;
  scrums_won?: number;
  tackles_made?: number;
  tackles_missed?: number;
  territory_pct?: number;
  yellow_cards?: number;
};

export type Top14MatchStats = {
  away: Top14TeamStats;
  home: Top14TeamStats;
  sourceUrl: string;
};

type StatField = keyof Top14TeamStats;
type Logger = Pick<Console, "warn">;

type ParsedRow = {
  awayValue: string;
  homeValue: string;
  label: string;
};

const TOP14_ORIGIN = "https://top14.lnr.fr";

const STAT_LABELS: Array<{
  field: StatField;
  kind: "count" | "percent";
  patterns: RegExp[];
}> = [
  {
    field: "possession_pct",
    kind: "percent",
    patterns: [/possession/i],
  },
  {
    field: "territory_pct",
    kind: "percent",
    patterns: [/territoire/i, /occupation/i],
  },
  {
    field: "lineouts_won",
    kind: "count",
    patterns: [/touches?\s+(?:gagn|remport)/i, /lineouts?\s+won/i],
  },
  {
    field: "lineouts_total",
    kind: "count",
    patterns: [/touches?\s+(?:obten|jou|total)/i, /lineouts?\s+total/i],
  },
  {
    field: "scrums_won",
    kind: "count",
    patterns: [/m[eê]l[ée]es?\s+(?:gagn|remport)/i, /scrums?\s+won/i],
  },
  {
    field: "scrums_total",
    kind: "count",
    patterns: [/m[eê]l[ée]es?\s+(?:obten|jou|total)/i, /scrums?\s+total/i],
  },
  {
    field: "tackles_made",
    kind: "count",
    patterns: [/plaquages?\s+(?:r[eé]uss|effectu|made)/i, /tackles?\s+made/i],
  },
  {
    field: "tackles_missed",
    kind: "count",
    patterns: [/plaquages?\s+manqu/i, /missed\s+tackles?/i],
  },
  {
    field: "carries",
    kind: "count",
    patterns: [/ballons?\s+jou/i, /carries/i],
  },
  {
    field: "penalties_conceded",
    kind: "count",
    patterns: [/p[eé]nalit[eé]s?\s+(?:conc[eé]d|conced)/i],
  },
  {
    field: "yellow_cards",
    kind: "count",
    patterns: [/cartons?\s+jaunes?/i, /yellow\s+cards?/i],
  },
  {
    field: "red_cards",
    kind: "count",
    patterns: [/cartons?\s+rouges?/i, /red\s+cards?/i],
  },
  {
    field: "errors",
    kind: "count",
    patterns: [/en\s*-?\s*avants?/i, /knock-?ons?/i, /errors?/i],
  },
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeStatKey(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fieldFromLabel(label: string): StatField | null {
  const normalized = normalizeText(label);
  const normalizedKey = normalizeStatKey(label);

  for (const item of STAT_LABELS) {
    if (
      item.field === normalizedKey ||
      item.patterns.some((pattern) => pattern.test(normalized))
    ) {
      return item.field;
    }
  }

  return null;
}

function kindForField(field: StatField): "count" | "percent" {
  return field.endsWith("_pct") ? "percent" : "count";
}

function parseNumericValue(value: string): number | null {
  const match = normalizeText(value)
    .replace(",", ".")
    .match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  return Number(match[0]);
}

function validateValue(
  field: StatField,
  rawValue: string,
  logger: Logger,
): number | null {
  const value = parseNumericValue(rawValue);

  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  if (kindForField(field) === "percent") {
    if (value < 0 || value > 100) {
      logger.warn(`Skipping invalid Top 14 percentage ${field}: ${rawValue}`);
      return null;
    }

    return Number(value.toFixed(2));
  }

  if (!Number.isInteger(value) || value < 0) {
    logger.warn(`Skipping invalid Top 14 count ${field}: ${rawValue}`);
    return null;
  }

  return value;
}

function assignStat(
  target: Top14TeamStats,
  field: StatField,
  value: string,
  logger: Logger,
) {
  const validated = validateValue(field, value, logger);

  if (validated !== null) {
    target[field] = validated;
  }
}

function parseDataStatRows(html: string): ParsedRow[] {
  const $ = load(html);
  const rows: ParsedRow[] = [];

  $("[data-stat], [data-stat-key], [data-label]").each((_, element) => {
    const node = $(element);
    const label =
      node.attr("data-stat") ??
      node.attr("data-stat-key") ??
      node.attr("data-label") ??
      "";
    const homeValue =
      node.find("[data-home], .home, .team-home, .stat-home").first().text() ||
      node.attr("data-home") ||
      "";
    const awayValue =
      node.find("[data-away], .away, .team-away, .stat-away").first().text() ||
      node.attr("data-away") ||
      "";

    if (label && homeValue && awayValue) {
      rows.push({
        awayValue: normalizeText(awayValue),
        homeValue: normalizeText(homeValue),
        label: normalizeText(label),
      });
    }
  });

  return rows;
}

function parseStatsBarRows(html: string): ParsedRow[] {
  const $ = load(html);
  const rows: ParsedRow[] = [];

  $(".stats-bar").each((_, element) => {
    const node = $(element);
    const label = normalizeText(node.find(".stats-bar__title").first().text());
    const values = node
      .find(".stats-bar__val")
      .map((__, valueElement) => normalizeText($(valueElement).text()))
      .get()
      .filter(Boolean);

    if (!label || values.length < 2 || !fieldFromLabel(label)) {
      return;
    }

    rows.push({
      awayValue: values[values.length - 1]!,
      homeValue: values[0]!,
      label,
    });
  });

  return rows;
}

function parseTableRows(html: string): ParsedRow[] {
  const $ = load(html);
  const rows: ParsedRow[] = [];

  $("tr").each((_, element) => {
    const cells = $(element)
      .find("th,td")
      .map((__, cell) => normalizeText($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 3) {
      return;
    }

    const numericIndexes = cells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => parseNumericValue(cell) !== null);

    if (numericIndexes.length < 2) {
      return;
    }

    const first = numericIndexes[0]!;
    const last = numericIndexes[numericIndexes.length - 1]!;
    const label = cells
      .filter((_, index) => index !== first.index && index !== last.index)
      .find((cell) => fieldFromLabel(cell));

    if (!label) {
      return;
    }

    rows.push({
      awayValue: last.cell,
      homeValue: first.cell,
      label,
    });
  });

  return rows;
}

function parseLooseLabelRows(html: string): ParsedRow[] {
  const $ = load(html);
  const rows: ParsedRow[] = [];
  const selectors = [
    ".stat-row",
    ".stats-row",
    ".match-stat",
    ".fixture-stat",
    "[class*='statistique']",
    "[class*='statistics']",
  ].join(",");

  $(selectors).each((_, element) => {
    const text = normalizeText($(element).text());
    const field = fieldFromLabel(text);

    if (!field) {
      return;
    }

    const numbers = text.match(/-?\d+(?:[,.]\d+)?\s*%?/g) ?? [];

    if (numbers.length < 2) {
      return;
    }

    rows.push({
      awayValue: numbers[numbers.length - 1]!,
      homeValue: numbers[0]!,
      label: field,
    });
  });

  return rows;
}

export function parseTop14MatchStatsHtml(
  html: string,
  sourceUrl: string,
  logger: Logger = console,
): Top14MatchStats | null {
  const rows = [
    ...parseDataStatRows(html),
    ...parseStatsBarRows(html),
    ...parseTableRows(html),
    ...parseLooseLabelRows(html),
  ];
  const home: Top14TeamStats = {};
  const away: Top14TeamStats = {};
  const seen = new Set<StatField>();

  for (const row of rows) {
    const field = fieldFromLabel(row.label);

    if (!field || seen.has(field)) {
      continue;
    }

    assignStat(home, field, row.homeValue, logger);
    assignStat(away, field, row.awayValue, logger);
    seen.add(field);
  }

  if (Object.keys(home).length === 0 && Object.keys(away).length === 0) {
    return null;
  }

  return { away, home, sourceUrl };
}

export function buildTop14MatchStatsUrl(matchPath: string) {
  const normalized = matchPath.startsWith("http")
    ? matchPath
    : new URL(matchPath, TOP14_ORIGIN).toString();
  const withoutTrailingSlash = normalized.replace(/\/+$/g, "");

  if (withoutTrailingSlash.endsWith("/statistiques-du-match")) {
    return withoutTrailingSlash;
  }

  return `${withoutTrailingSlash}/statistiques-du-match`;
}

export async function fetchTop14MatchStats(matchPath: string) {
  const sourceUrl = buildTop14MatchStatsUrl(matchPath);
  const response = await fetchWithPolicy(sourceUrl);
  const html = await response.text();

  return parseTop14MatchStatsHtml(html, sourceUrl);
}
