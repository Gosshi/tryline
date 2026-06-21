/**
 * Pull read-only Google Search Console data into gitignored local files.
 *
 * Setup:
 * 1. Create a service account and add its email to Search Console as a
 *    Restricted user.
 * 2. Store its JSON key outside this repository.
 * 3. Create `.env.gsc.local` with:
 *      GSC_SITE_URL=sc-domain:trylinerugby.com
 *      GSC_SA_KEY_PATH=/absolute/path/outside/repository/key.json
 *
 * Run:
 *   node --env-file=.env.gsc.local tools/run-ts.cjs tools/gsc-pull.ts
 *   node --env-file=.env.gsc.local tools/run-ts.cjs tools/gsc-pull.ts \
 *     --range 7d --dims query,page --inspect all --inspect-limit 20
 *
 * This tool requests only the `webmasters.readonly` OAuth scope. It does not
 * call the Indexing API or any submit/remove endpoint.
 */

import { load } from "cheerio";
import { google } from "googleapis";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SITE_URL } from "@/lib/site";

export const GSC_READONLY_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
export const DEFAULT_GSC_SITE_URL = "sc-domain:trylinerugby.com";
export const INSPECTION_DELAY_MS = 150;
export const MAX_DAILY_INSPECTIONS = 2_000;
export const SEARCH_ANALYTICS_PAGE_SIZE = 1_000;

export const URL_GROUP_PREFIXES = {
  competitions: ["/competitions/", "/c/"],
  h2h: ["/h2h/"],
  matches: ["/matches/"],
  players: ["/players/"],
  teams: ["/teams/", "/t/"],
} as const;

export type SearchDimension = "country" | "date" | "device" | "page" | "query";
export type UrlGroup = keyof typeof URL_GROUP_PREFIXES;

export type DateRange = {
  endDate: string;
  label: string;
  startDate: string;
};

export type CliOptions = {
  dimensions: SearchDimension[];
  inspectGroups: UrlGroup[];
  inspectLimit: number;
  range: DateRange;
  rowLimit: number;
};

type SearchApiRow = {
  clicks?: number | null;
  ctr?: number | null;
  impressions?: number | null;
  keys?: string[] | null;
  position?: number | null;
};

export type SearchAnalyticsRow = {
  clicks: number;
  ctr: number;
  impressions: number;
  keys: Partial<Record<SearchDimension, string>>;
  position: number;
};

export type SearchAnalyticsOutput = {
  meta: {
    dims: SearchDimension[];
    range: DateRange;
    siteUrl: string;
    totalRows: number;
  };
  rows: SearchAnalyticsRow[];
};

export type GroupedSitemapUrl = {
  group: UrlGroup;
  prefix: string;
  url: string;
};

export type UrlInspectionOutput = {
  coverageState: string | null;
  googleCanonical: string | null;
  group: UrlGroup;
  indexingState: string | null;
  lastCrawlTime: string | null;
  prefix: string;
  robotsTxtState: string | null;
  url: string;
  userCanonical: string | null;
  verdict: string | null;
};

type SearchAnalyticsClient = {
  searchanalytics: {
    query: (params: {
      requestBody: {
        dimensions: SearchDimension[];
        endDate: string;
        rowLimit: number;
        startDate: string;
        startRow: number;
      };
      siteUrl: string;
    }) => Promise<{ data: { rows?: SearchApiRow[] | null } }>;
  };
};

type InspectionClient = {
  urlInspection: {
    index: {
      inspect: (params: {
        requestBody: {
          inspectionUrl: string;
          languageCode: string;
          siteUrl: string;
        };
      }) => Promise<{
        data: {
          inspectionResult?: {
            indexStatusResult?: {
              coverageState?: string | null;
              googleCanonical?: string | null;
              indexingState?: string | null;
              lastCrawlTime?: string | null;
              robotsTxtState?: string | null;
              userCanonical?: string | null;
              verdict?: string | null;
            } | null;
          } | null;
        };
      }>;
    };
  };
};

const SEARCH_DIMENSIONS = new Set<SearchDimension>([
  "country",
  "date",
  "device",
  "page",
  "query",
]);
const URL_GROUPS = Object.keys(URL_GROUP_PREFIXES) as UrlGroup[];

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && formatUtcDate(date) === value;
}

export function parseDateRange(value: string, now = new Date()): DateRange {
  if (value === "7d" || value === "28d") {
    const days = Number(value.slice(0, -1));
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    end.setUTCDate(end.getUTCDate() - 3);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    return {
      endDate: formatUtcDate(end),
      label: value,
      startDate: formatUtcDate(start),
    };
  }

  const [startDate, endDate, extra] = value.split(":");

  if (
    extra !== undefined ||
    !startDate ||
    !endDate ||
    !isIsoDate(startDate) ||
    !isIsoDate(endDate) ||
    startDate > endDate
  ) {
    throw new Error(
      `Invalid --range value: ${value}. Use 7d, 28d, or YYYY-MM-DD:YYYY-MM-DD.`,
    );
  }

  return { endDate, label: value, startDate };
}

export function parseDimensions(value: string): SearchDimension[] {
  const dimensions = value
    .split(",")
    .map((dimension) => dimension.trim())
    .filter(Boolean);

  if (
    dimensions.length === 0 ||
    dimensions.some(
      (dimension) => !SEARCH_DIMENSIONS.has(dimension as SearchDimension),
    )
  ) {
    throw new Error(
      `Invalid --dims value: ${value}. Supported dimensions: ${[...SEARCH_DIMENSIONS].join(",")}.`,
    );
  }

  return [...new Set(dimensions)] as SearchDimension[];
}

function parsePositiveInteger(value: string, option: string, maximum: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(
      `Invalid ${option} value: ${value}. Expected an integer from 1 to ${maximum}.`,
    );
  }

  return parsed;
}

function parseInspectGroups(value: string): UrlGroup[] {
  if (value === "none") {
    return [];
  }

  if (value === "all") {
    return URL_GROUPS;
  }

  const groups = value
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);

  if (
    groups.length === 0 ||
    groups.some((group) => !URL_GROUPS.includes(group as UrlGroup))
  ) {
    throw new Error(
      `Invalid --inspect value: ${value}. Use all, none, or: ${URL_GROUPS.join(",")}.`,
    );
  }

  return [...new Set(groups)] as UrlGroup[];
}

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

export function parseCliOptions(args: string[], now = new Date()): CliOptions {
  let dimensions = parseDimensions("query,page");
  let inspectGroups: UrlGroup[] = [];
  let inspectLimit = 50;
  let range = parseDateRange("28d", now);
  let rowLimit = 1_000;

  for (let index = 0; index < args.length; ) {
    const argument = args[index]!;

    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const option = argument.split("=")[0];
    const { consumed, value } = readOptionValue(args, index);

    switch (option) {
      case "--dims":
        dimensions = parseDimensions(value);
        break;
      case "--inspect":
        inspectGroups = parseInspectGroups(value);
        break;
      case "--inspect-limit":
        inspectLimit = parsePositiveInteger(value, option, 2_000);
        break;
      case "--range":
        range = parseDateRange(value, now);
        break;
      case "--row-limit":
        rowLimit = parsePositiveInteger(value, option, 25_000);
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
    }

    index += consumed;
  }

  if (inspectGroups.length * inspectLimit > MAX_DAILY_INSPECTIONS) {
    throw new Error(
      `Inspection request could exceed the ${MAX_DAILY_INSPECTIONS}/day quota. Reduce --inspect-limit or the number of groups.`,
    );
  }

  return { dimensions, inspectGroups, inspectLimit, range, rowLimit };
}

export function formatSearchAnalyticsOutput(params: {
  dimensions: SearchDimension[];
  range: DateRange;
  rows: SearchApiRow[];
  siteUrl: string;
}): SearchAnalyticsOutput {
  const rows = params.rows.map((row) => ({
    clicks: row.clicks ?? 0,
    ctr: row.ctr ?? 0,
    impressions: row.impressions ?? 0,
    keys: Object.fromEntries(
      params.dimensions.map((dimension, index) => [
        dimension,
        row.keys?.[index] ?? "",
      ]),
    ),
    position: row.position ?? 0,
  }));

  return {
    meta: {
      dims: params.dimensions,
      range: params.range,
      siteUrl: params.siteUrl,
      totalRows: rows.length,
    },
    rows,
  };
}

export async function fetchSearchAnalytics(params: {
  client: SearchAnalyticsClient;
  dimensions: SearchDimension[];
  range: DateRange;
  rowLimit: number;
  siteUrl: string;
}) {
  const rows: SearchApiRow[] = [];

  while (rows.length < params.rowLimit) {
    const remaining = params.rowLimit - rows.length;
    const requestedRows = Math.min(remaining, SEARCH_ANALYTICS_PAGE_SIZE);
    const response = await params.client.searchanalytics.query({
      requestBody: {
        dimensions: params.dimensions,
        endDate: params.range.endDate,
        rowLimit: requestedRows,
        startDate: params.range.startDate,
        startRow: rows.length,
      },
      siteUrl: params.siteUrl,
    });
    const page = response.data.rows ?? [];
    rows.push(...page);

    if (page.length < requestedRows) {
      break;
    }
  }

  return formatSearchAnalyticsOutput({
    dimensions: params.dimensions,
    range: params.range,
    rows: rows.slice(0, params.rowLimit),
    siteUrl: params.siteUrl,
  });
}

function parseSitemapXml(xml: string) {
  const $ = load(xml, { xmlMode: true });
  const childSitemaps = $("sitemap > loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);
  const urls = $("url > loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);

  return { childSitemaps, urls };
}

export async function collectSitemapUrls(params: {
  fetchImpl?: typeof fetch;
  sitemapUrl: string;
  siteOrigin: string;
}): Promise<string[]> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const allowedOrigin = new URL(params.siteOrigin).origin;
  const pending = [params.sitemapUrl];
  const visited = new Set<string>();
  const urls = new Set<string>();

  while (pending.length > 0) {
    const sitemapUrl = pending.shift()!;

    if (visited.has(sitemapUrl)) {
      continue;
    }

    const parsedSitemapUrl = new URL(sitemapUrl);

    if (parsedSitemapUrl.origin !== allowedOrigin) {
      throw new Error(`Refusing cross-origin sitemap: ${sitemapUrl}`);
    }

    visited.add(sitemapUrl);
    const response = await fetchImpl(sitemapUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch sitemap ${sitemapUrl}: HTTP ${response.status}`,
      );
    }

    const parsed = parseSitemapXml(await response.text());

    for (const child of parsed.childSitemaps) {
      pending.push(new URL(child, sitemapUrl).toString());
    }

    for (const url of parsed.urls) {
      const absoluteUrl = new URL(url, params.siteOrigin);

      if (absoluteUrl.origin === allowedOrigin) {
        urls.add(absoluteUrl.toString());
      }
    }
  }

  return [...urls];
}

export function groupSitemapUrls(
  urls: string[],
  selectedGroups: UrlGroup[] = URL_GROUPS,
): GroupedSitemapUrl[] {
  const selected = new Set(selectedGroups);
  const grouped: GroupedSitemapUrl[] = [];

  for (const url of [...new Set(urls)]) {
    const pathname = new URL(url).pathname;

    for (const group of URL_GROUPS) {
      if (!selected.has(group)) {
        continue;
      }

      const prefix = URL_GROUP_PREFIXES[group].find((candidate) =>
        pathname.startsWith(candidate),
      );

      if (prefix) {
        grouped.push({ group, prefix, url });
        break;
      }
    }
  }

  return grouped;
}

export function selectInspectionTargets(
  urls: GroupedSitemapUrl[],
  inspectLimit: number,
) {
  const counts = new Map<UrlGroup, number>();

  return urls.filter((entry) => {
    const count = counts.get(entry.group) ?? 0;

    if (count >= inspectLimit) {
      return false;
    }

    counts.set(entry.group, count + 1);
    return true;
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getHttpStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  const status = candidate.response?.status ?? candidate.code;
  return typeof status === "number" ? status : null;
}

async function inspectWithRetry(params: {
  client: InspectionClient;
  siteUrl: string;
  url: string;
}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await params.client.urlInspection.index.inspect({
        requestBody: {
          inspectionUrl: params.url,
          languageCode: "ja-JP",
          siteUrl: params.siteUrl,
        },
      });
    } catch (error) {
      const status = getHttpStatus(error);
      const retryable = status === 429 || (status !== null && status >= 500);

      if (!retryable || attempt === 3) {
        throw error;
      }

      await sleep(attempt * 1_000);
    }
  }

  throw new Error("URL inspection retry loop exited unexpectedly.");
}

export async function inspectUrls(params: {
  client: InspectionClient;
  delayMs?: number;
  siteUrl: string;
  targets: GroupedSitemapUrl[];
}): Promise<UrlInspectionOutput[]> {
  const results: UrlInspectionOutput[] = [];

  for (const [index, target] of params.targets.entries()) {
    try {
      const response = await inspectWithRetry({
        client: params.client,
        siteUrl: params.siteUrl,
        url: target.url,
      });
      const status = response.data.inspectionResult?.indexStatusResult;

      results.push({
        coverageState: status?.coverageState ?? null,
        googleCanonical: status?.googleCanonical ?? null,
        group: target.group,
        indexingState: status?.indexingState ?? null,
        lastCrawlTime: status?.lastCrawlTime ?? null,
        prefix: target.prefix,
        robotsTxtState: status?.robotsTxtState ?? null,
        url: target.url,
        userCanonical: status?.userCanonical ?? null,
        verdict: status?.verdict ?? null,
      });
    } catch (error) {
      console.warn(
        `[gsc] URL inspection skipped: ${target.url}`,
        String(error),
      );
    }

    if (index < params.targets.length - 1) {
      await sleep(params.delayMs ?? INSPECTION_DELAY_MS);
    }
  }

  return results;
}

function aggregateSearchRows(
  rows: SearchAnalyticsRow[],
  dimension: "page" | "query",
) {
  const totals = new Map<
    string,
    { clicks: number; impressions: number; positionTotal: number }
  >();

  for (const row of rows) {
    const key = row.keys[dimension];

    if (!key) {
      continue;
    }

    const current = totals.get(key) ?? {
      clicks: 0,
      impressions: 0,
      positionTotal: 0,
    };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.positionTotal += row.position * row.impressions;
    totals.set(key, current);
  }

  return [...totals.entries()]
    .map(([key, totals]) => ({
      clicks: totals.clicks,
      impressions: totals.impressions,
      key,
      position:
        totals.impressions > 0 ? totals.positionTotal / totals.impressions : 0,
    }))
    .sort(
      (left, right) =>
        right.clicks - left.clicks || right.impressions - left.impressions,
    )
    .slice(0, 10);
}

export function buildSummaryMarkdown(params: {
  inspectionRows: UrlInspectionOutput[];
  search: SearchAnalyticsOutput;
}) {
  const lines = [
    "# GSC Analysis Summary",
    "",
    `- Property: \`${params.search.meta.siteUrl}\``,
    `- Range: ${params.search.meta.range.startDate} to ${params.search.meta.range.endDate}`,
    `- Search rows: ${params.search.meta.totalRows}`,
    "",
  ];

  for (const dimension of ["query", "page"] as const) {
    lines.push(
      `## Top ${dimension === "query" ? "Queries" : "Pages"}`,
      "",
      "| Value | Clicks | Impressions | Avg. position |",
      "| --- | ---: | ---: | ---: |",
    );

    for (const row of aggregateSearchRows(params.search.rows, dimension)) {
      lines.push(
        `| ${row.key.replaceAll("|", "\\|")} | ${row.clicks} | ${row.impressions} | ${row.position.toFixed(1)} |`,
      );
    }

    lines.push("");
  }

  lines.push(
    "## URL Inspection",
    "",
    "| Group | Prefix | Inspected | Indexed | Not indexed |",
    "| --- | --- | ---: | ---: | ---: |",
  );

  const keys = new Set(
    params.inspectionRows.map((row) => `${row.group}\t${row.prefix}`),
  );

  for (const key of [...keys].sort()) {
    const [group, prefix] = key.split("\t") as [UrlGroup, string];
    const rows = params.inspectionRows.filter(
      (row) => row.group === group && row.prefix === prefix,
    );
    const indexed = rows.filter((row) => row.verdict === "PASS").length;
    lines.push(
      `| ${group} | \`${prefix}\` | ${rows.length} | ${indexed} | ${rows.length - indexed} |`,
    );
  }

  if (params.inspectionRows.length === 0) {
    lines.push("| Not requested | - | 0 | 0 | 0 |");
  }

  lines.push("");
  return lines.join("\n");
}

function filenameSafe(value: string) {
  return value.replaceAll(":", "_");
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const siteUrl = process.env.GSC_SITE_URL ?? DEFAULT_GSC_SITE_URL;
  const keyFile =
    process.env.GSC_SA_KEY_PATH ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!keyFile) {
    throw new Error(
      "Set GSC_SA_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON key path.",
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [GSC_READONLY_SCOPE],
  });
  const webmasters = google.webmasters({ auth, version: "v3" });
  const searchConsole = google.searchconsole({ auth, version: "v1" });
  const search = await fetchSearchAnalytics({
    client: webmasters,
    dimensions: options.dimensions,
    range: options.range,
    rowLimit: options.rowLimit,
    siteUrl,
  });
  const outputDirectory = path.join(process.cwd(), "tmp", "gsc");
  await mkdir(outputDirectory, { recursive: true });

  const searchPath = path.join(
    outputDirectory,
    `search-analytics-${filenameSafe(options.range.label)}.json`,
  );
  await writeFile(searchPath, `${JSON.stringify(search, null, 2)}\n`, "utf8");

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  let inspectionRows: UrlInspectionOutput[] = [];

  if (options.inspectGroups.length > 0) {
    const siteOrigin = new URL(SITE_URL).origin;
    const sitemapUrls = await collectSitemapUrls({
      sitemapUrl: new URL("/sitemap.xml", siteOrigin).toString(),
      siteOrigin,
    });
    const grouped = groupSitemapUrls(sitemapUrls, options.inspectGroups);
    const targets = selectInspectionTargets(grouped, options.inspectLimit);
    inspectionRows = await inspectUrls({
      client: searchConsole,
      siteUrl,
      targets,
    });

    await writeFile(
      path.join(outputDirectory, `url-inspection-${timestamp}.json`),
      `${JSON.stringify(inspectionRows, null, 2)}\n`,
      "utf8",
    );
  }

  await writeFile(
    path.join(outputDirectory, `summary-${timestamp}.md`),
    buildSummaryMarkdown({ inspectionRows, search }),
    "utf8",
  );

  console.info(
    `[gsc] wrote ${search.meta.totalRows} search rows and ${inspectionRows.length} inspection rows to ${outputDirectory}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(
      `[gsc] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
