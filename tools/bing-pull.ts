/**
 * Pull read-only Bing Webmaster Tools data into gitignored local files.
 *
 * Run:
 *   node --env-file=.env.bing.local tools/run-ts.cjs tools/bing-pull.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BING_API_BASE_URL = "https://ssl.bing.com/webmaster/api.svc/json";
export const DEFAULT_BING_SITE_URL = "https://www.trylinerugby.com/";
export const BING_READONLY_METHODS = [
  "GetUserSites",
  "GetRankAndTrafficStats",
  "GetQueryStats",
  "GetPageStats",
] as const;

const BING_METHOD_BY_OPTION = {
  page: "GetPageStats",
  query: "GetQueryStats",
  sites: "GetUserSites",
  traffic: "GetRankAndTrafficStats",
} as const;

type BingMethod = (typeof BING_READONLY_METHODS)[number];
export type BingMethodOption = keyof typeof BING_METHOD_BY_OPTION;
export type BingApiRecord = Record<string, unknown>;
export type BingPullOptions = {
  methods: BingMethodOption[];
  outputDirectory: string;
};
export type BingPullResults = {
  pageStats?: unknown;
  queryStats?: unknown;
  rankAndTrafficStats?: unknown;
  userSites?: unknown;
};

const BING_METHOD_OPTIONS = Object.keys(
  BING_METHOD_BY_OPTION,
) as BingMethodOption[];
const BING_METHOD_ALLOWLIST = new Set<string>(BING_READONLY_METHODS);

function readOptionValue(args: string[], index: number) {
  const argument = args[index]!;
  const equalsIndex = argument.indexOf("=");

  if (equalsIndex >= 0) {
    return { consumed: 1, value: argument.slice(equalsIndex + 1) };
  }

  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing value for ${argument}.`);
  }

  return { consumed: 2, value: next };
}

export function parseMethods(value: string): BingMethodOption[] {
  const methods = value
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);

  if (
    methods.length === 0 ||
    methods.some(
      (method) => !BING_METHOD_OPTIONS.includes(method as BingMethodOption),
    )
  ) {
    throw new Error(
      `Invalid --methods value: ${value}. Supported methods: ${BING_METHOD_OPTIONS.join(",")}.`,
    );
  }

  return [...new Set(methods)] as BingMethodOption[];
}

export function parseCliOptions(args: string[]): BingPullOptions {
  let methods = parseMethods("traffic,query,page");
  let outputDirectory = path.join("tmp", "bing");

  for (let index = 0; index < args.length; ) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const option = argument.split("=")[0];
    const { consumed, value } = readOptionValue(args, index);

    switch (option) {
      case "--methods":
        methods = parseMethods(value);
        break;
      case "--out":
        outputDirectory = value;
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
    }

    index += consumed;
  }

  return { methods, outputDirectory };
}

export function maskBingApiKey(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("apikey")) {
    parsed.searchParams.set("apikey", "***");
  }
  return parsed.toString();
}

function redactApiKey(value: string, apiKey: string) {
  return apiKey ? value.replaceAll(apiKey, "***") : value;
}

function assertAllowedMethod(method: string): asserts method is BingMethod {
  if (!BING_METHOD_ALLOWLIST.has(method)) {
    throw new Error(`Bing API method is not allowed: ${method}`);
  }
}

export function buildBingApiUrl(params: {
  apiKey: string;
  method: string;
  siteUrl?: string;
}) {
  assertAllowedMethod(params.method);

  const url = new URL(`${BING_API_BASE_URL}/${params.method}`);
  url.searchParams.set("apikey", params.apiKey);
  if (params.siteUrl) {
    url.searchParams.set("siteUrl", params.siteUrl);
  }
  return url.toString();
}

export function requireBingApiKey(apiKey: string | undefined) {
  if (!apiKey) {
    throw new Error("BING_API_KEY is not set.");
  }
  return apiKey;
}

function isBingApiError(value: unknown): value is {
  ErrorCode: number;
  Message?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { ErrorCode?: unknown }).ErrorCode === "number"
  );
}

export async function requestBingApi(params: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  method: string;
  siteUrl?: string;
}) {
  const url = buildBingApiUrl(params);
  const safeUrl = maskBingApiKey(url);
  const fetchImpl = params.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(url, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      method: "GET",
    });
  } catch {
    throw new Error(`Bing API network request failed for ${safeUrl}`);
  }

  if (!response.ok) {
    throw new Error(`Bing API HTTP error ${response.status} for ${safeUrl}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Bing API returned invalid JSON for ${safeUrl}`);
  }

  if (isBingApiError(body)) {
    const message = redactApiKey(
      String(body.Message ?? "Unknown error"),
      params.apiKey,
    );
    throw new Error(`Bing API error ${body.ErrorCode}: ${message}`);
  }

  if (typeof body !== "object" || body === null || !("d" in body)) {
    throw new Error(`Bing API returned an unexpected response for ${safeUrl}`);
  }

  return (body as { d: unknown }).d;
}

export function parseMicrosoftDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  if (!match?.[1]) {
    return null;
  }

  // Bing reports daily aggregates, so interpret the epoch milliseconds as UTC
  // and deliberately ignore the source offset when deriving YYYY-MM-DD.
  const date = new Date(Number(match[1]));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function asRecords(value: unknown): BingApiRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (row): row is BingApiRecord =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

export function normalizeRankAndTrafficStats(
  value: unknown,
  warn: (message: string) => void = console.warn,
) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((row) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      return row;
    }

    const record = row as BingApiRecord;
    const rawDate = record.Date ?? record.date;
    const date = parseMicrosoftDate(rawDate);
    if (!date) {
      warn("[bing] Unable to parse a Microsoft date in rank-and-traffic data.");
    }

    const normalized: BingApiRecord = { ...record, date };
    delete normalized.Date;
    return normalized;
  });
}

function numberValue(row: BingApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function stringValue(row: BingApiRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return "-";
}

function topRows(rows: BingApiRecord[], valueKeys: string[]) {
  return [...rows]
    .sort(
      (left, right) =>
        numberValue(right, ["Clicks", "clicks"]) -
          numberValue(left, ["Clicks", "clicks"]) ||
        numberValue(right, ["Impressions", "impressions"]) -
          numberValue(left, ["Impressions", "impressions"]),
    )
    .slice(0, 10)
    .map((row) => ({
      clicks: numberValue(row, ["Clicks", "clicks"]),
      impressions: numberValue(row, ["Impressions", "impressions"]),
      value: stringValue(row, valueKeys),
    }));
}

function markdownCell(value: string) {
  return value.replaceAll("|", "\\|");
}

export function buildSummaryMarkdown(params: {
  pageStats: unknown;
  queryStats: unknown;
  rankAndTrafficStats: unknown;
  siteUrl: string;
}) {
  const trafficRows = asRecords(params.rankAndTrafficStats);
  const queryRows = asRecords(params.queryStats);
  const pageRows = asRecords(params.pageStats);
  const clicks = trafficRows.reduce(
    (total, row) => total + numberValue(row, ["Clicks", "clicks"]),
    0,
  );
  const impressions = trafficRows.reduce(
    (total, row) => total + numberValue(row, ["Impressions", "impressions"]),
    0,
  );
  const dates = trafficRows
    .map((row) => row.date)
    .filter((date): date is string => typeof date === "string")
    .sort();
  const period =
    dates.length > 0
      ? `${dates[0]} to ${dates.at(-1)}`
      : "No dated traffic rows";
  const lines = [
    "# Bing Webmaster Tools Analysis Summary",
    "",
    "> Note: Bing Clicks / Impressions include Web, Chat, News, Images, Videos, and Knowledge Panel. GSC defaults to Web only, so the totals are not directly comparable.",
    "",
    `- Property: \`${params.siteUrl}\``,
    `- Period: ${period}`,
    `- Traffic rows: ${trafficRows.length}`,
    `- Query rows: ${queryRows.length}`,
    `- Page rows: ${pageRows.length}`,
    `- Total Clicks: ${clicks}`,
    `- Total Impressions: ${impressions}`,
    `- CTR: ${impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0.00"}%`,
    "",
  ];

  for (const [heading, rows] of [
    ["Top Queries", topRows(queryRows, ["Query", "query"])],
    ["Top Pages", topRows(pageRows, ["Url", "URL", "Page", "page"])],
  ] as const) {
    lines.push(
      `## ${heading}`,
      "",
      "| Value | Clicks | Impressions |",
      "| --- | ---: | ---: |",
    );

    if (rows.length === 0) {
      lines.push("| - | 0 | 0 |");
    } else {
      for (const row of rows) {
        lines.push(
          `| ${markdownCell(row.value)} | ${row.clicks} | ${row.impressions} |`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function pullBingData(params: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  methods: BingMethodOption[];
  siteUrl: string;
  warn?: (message: string) => void;
}): Promise<BingPullResults> {
  const results: BingPullResults = {};

  for (const option of params.methods) {
    const method = BING_METHOD_BY_OPTION[option];
    const data = await requestBingApi({
      apiKey: params.apiKey,
      fetchImpl: params.fetchImpl,
      method,
      siteUrl: option === "sites" ? undefined : params.siteUrl,
    });

    switch (option) {
      case "page":
        results.pageStats = data;
        break;
      case "query":
        results.queryStats = data;
        break;
      case "sites":
        results.userSites = data;
        break;
      case "traffic":
        results.rankAndTrafficStats = normalizeRankAndTrafficStats(
          data,
          params.warn,
        );
        break;
    }
  }

  return results;
}

function filenameSafe(value: string) {
  return value.replaceAll(":", "-");
}

export async function writeBingOutputs(params: {
  outputDirectory: string;
  results: BingPullResults;
  siteUrl: string;
  timestamp?: Date;
}) {
  const hasStats =
    params.results.rankAndTrafficStats !== undefined ||
    params.results.queryStats !== undefined ||
    params.results.pageStats !== undefined;
  if (!hasStats) {
    return;
  }

  await mkdir(params.outputDirectory, { recursive: true });
  const writes: Array<Promise<void>> = [];
  if (params.results.rankAndTrafficStats !== undefined) {
    writes.push(
      writeFile(
        path.join(params.outputDirectory, "rank-and-traffic.json"),
        `${JSON.stringify(params.results.rankAndTrafficStats, null, 2)}\n`,
        "utf8",
      ),
    );
  }
  if (params.results.queryStats !== undefined) {
    writes.push(
      writeFile(
        path.join(params.outputDirectory, "query-stats.json"),
        `${JSON.stringify(params.results.queryStats, null, 2)}\n`,
        "utf8",
      ),
    );
  }
  if (params.results.pageStats !== undefined) {
    writes.push(
      writeFile(
        path.join(params.outputDirectory, "page-stats.json"),
        `${JSON.stringify(params.results.pageStats, null, 2)}\n`,
        "utf8",
      ),
    );
  }

  const timestamp = filenameSafe(
    (params.timestamp ?? new Date()).toISOString(),
  );
  writes.push(
    writeFile(
      path.join(params.outputDirectory, `summary-${timestamp}.md`),
      buildSummaryMarkdown({
        pageStats: params.results.pageStats ?? [],
        queryStats: params.results.queryStats ?? [],
        rankAndTrafficStats: params.results.rankAndTrafficStats ?? [],
        siteUrl: params.siteUrl,
      }),
      "utf8",
    ),
  );
  await Promise.all(writes);
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const apiKey = requireBingApiKey(process.env.BING_API_KEY);

  const siteUrl = process.env.BING_SITE_URL ?? DEFAULT_BING_SITE_URL;
  const results = await pullBingData({
    apiKey,
    methods: options.methods,
    siteUrl,
  });

  if (results.userSites !== undefined) {
    console.info("[bing] Accessible sites:");
    console.info(JSON.stringify(results.userSites, null, 2));
  }

  await writeBingOutputs({
    outputDirectory: options.outputDirectory,
    results,
    siteUrl,
  });

  if (
    results.rankAndTrafficStats !== undefined ||
    results.queryStats !== undefined ||
    results.pageStats !== undefined
  ) {
    console.info(`[bing] wrote analysis files to ${options.outputDirectory}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(
      `[bing] ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  });
}
