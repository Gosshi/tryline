/**
 * Local, read-only MCP server for Tryline search analytics.
 *
 * Register it from a shell where the required environment variables are set:
 *   codex mcp add tryline-analytics -- node tools/run-ts.cjs tools/analytics-mcp.ts
 */

import { google } from "googleapis";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_BING_SITE_URL,
  pullBingData,
  requireBingApiKey,
  type BingApiRecord,
} from "@/tools/bing-pull";
import {
  DEFAULT_GSC_SITE_URL,
  fetchSearchAnalytics,
  GSC_READONLY_SCOPE,
  parseDimensions,
  type SearchDimension,
} from "@/tools/gsc-pull";

const MAX_GSC_ROWS = 1_000;
const MAX_BING_ROWS = 20;

type JsonRecord = Record<string, unknown>;
type JsonRpcId = string | number | null;
export type JsonRpcRequest = {
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};
type JsonRpcResponse = {
  id: JsonRpcId;
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string };
};

export type AnalyticsServices = {
  bing: (methods: Array<"page" | "query" | "sites" | "traffic">) => Promise<{
    pageStats?: unknown;
    queryStats?: unknown;
    rankAndTrafficStats?: unknown;
    userSites?: unknown;
  }>;
  gsc: (input: {
    dimensions: SearchDimension[];
    range: McpRange;
    rowLimit: number;
  }) => Promise<unknown>;
};

export type McpRange = {
  endDate: string;
  label: "7d" | "28d" | "90d";
  startDate: string;
};

const TOOLS = [
  {
    name: "gsc_search_performance",
    description:
      "Read Google Search Console clicks, impressions, CTR, and position. Read-only; URL Inspection is intentionally unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        range: { enum: ["7d", "28d", "90d"], type: "string" },
        dimensions: {
          items: {
            enum: ["query", "page", "country", "device", "date"],
            type: "string",
          },
          type: "array",
        },
        row_limit: { maximum: MAX_GSC_ROWS, minimum: 1, type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "bing_search_performance",
    description:
      "Read Bing daily traffic and the top queries and pages. Read-only.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "bing_accessible_sites",
    description:
      "List the Bing Webmaster Tools sites available to the configured key. Read-only.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function numberValue(row: JsonRecord, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function stringValue(row: JsonRecord, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string") return value;
  }
  return "";
}

function compactBingRows(value: unknown, names: string[]) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (row): row is BingApiRecord =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    )
    .map((row) => {
      const record = row as JsonRecord;
      return {
        clicks: numberValue(record, ["Clicks", "clicks"]),
        impressions: numberValue(record, ["Impressions", "impressions"]),
        value: stringValue(record, names),
      };
    })
    .sort(
      (left, right) =>
        right.clicks - left.clicks || right.impressions - left.impressions,
    )
    .slice(0, MAX_BING_ROWS);
}

function compactDailyTraffic(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_BING_ROWS).map((row) => {
    const record = asRecord(row);
    return {
      clicks: numberValue(record, ["Clicks", "clicks"]),
      date: stringValue(record, ["date"]),
      impressions: numberValue(record, ["Impressions", "impressions"]),
    };
  });
}

export function parseMcpRange(value: unknown, now = new Date()): McpRange {
  if (value !== "7d" && value !== "28d" && value !== "90d") {
    throw new Error("range must be one of: 7d, 28d, 90d.");
  }
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (Number(value.slice(0, -1)) - 1));
  return {
    endDate: end.toISOString().slice(0, 10),
    label: value,
    startDate: start.toISOString().slice(0, 10),
  };
}

function parseGscInput(value: unknown) {
  const input = asRecord(value);
  const dimensions: SearchDimension[] =
    input.dimensions === undefined
      ? ["query", "page"]
      : parseDimensions(
          Array.isArray(input.dimensions) ? input.dimensions.join(",") : "",
        );
  const rowLimit = input.row_limit === undefined ? 100 : input.row_limit;
  if (
    !Number.isInteger(rowLimit) ||
    typeof rowLimit !== "number" ||
    rowLimit < 1 ||
    rowLimit > MAX_GSC_ROWS
  ) {
    throw new Error(`row_limit must be an integer from 1 to ${MAX_GSC_ROWS}.`);
  }
  return { dimensions, range: parseMcpRange(input.range ?? "28d"), rowLimit };
}

export function createProductionServices(
  env: NodeJS.ProcessEnv = process.env,
): AnalyticsServices {
  return {
    async gsc(input) {
      const keyFile = env.GSC_SA_KEY_PATH ?? env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!keyFile) throw new Error("GSC credentials are not configured.");
      const auth = new google.auth.GoogleAuth({
        keyFile,
        scopes: [GSC_READONLY_SCOPE],
      });
      const webmasters = google.webmasters({ auth, version: "v3" });
      return fetchSearchAnalytics({
        client: webmasters,
        ...input,
        siteUrl: env.GSC_SITE_URL ?? DEFAULT_GSC_SITE_URL,
      });
    },
    async bing(methods) {
      return pullBingData({
        apiKey: requireBingApiKey(env.BING_API_KEY),
        methods,
        siteUrl: env.BING_SITE_URL ?? DEFAULT_BING_SITE_URL,
        warn: () => undefined,
      });
    },
  };
}

function toolResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function error(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { error: { code, message }, id, jsonrpc: "2.0" };
}

export async function handleMcpRequest(
  request: JsonRpcRequest,
  services: AnalyticsServices = createProductionServices(),
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  if (request.method === "notifications/initialized") return null;
  if (request.method === "initialize") {
    return {
      id,
      jsonrpc: "2.0",
      result: {
        capabilities: { tools: {} },
        protocolVersion: "2025-06-18",
        serverInfo: { name: "tryline-analytics", version: "1.0.0" },
      },
    };
  }
  if (request.method === "tools/list")
    return { id, jsonrpc: "2.0", result: { tools: TOOLS } };
  if (request.method !== "tools/call")
    return error(id, -32601, "Method not found.");
  const params = asRecord(request.params);
  const name = params.name;
  try {
    if (name === "gsc_search_performance")
      return {
        id,
        jsonrpc: "2.0",
        result: toolResult(await services.gsc(parseGscInput(params.arguments))),
      };
    if (name === "bing_search_performance") {
      const result = await services.bing(["traffic", "query", "page"]);
      return {
        id,
        jsonrpc: "2.0",
        result: toolResult({
          dailyTraffic: compactDailyTraffic(result.rankAndTrafficStats),
          topPages: compactBingRows(result.pageStats, [
            "Url",
            "URL",
            "Page",
            "page",
          ]),
          topQueries: compactBingRows(result.queryStats, ["Query", "query"]),
        }),
      };
    }
    if (name === "bing_accessible_sites") {
      const result = await services.bing(["sites"]);
      return {
        id,
        jsonrpc: "2.0",
        result: toolResult({ sites: result.userSites ?? [] }),
      };
    }
    return error(id, -32602, "Unknown analytics tool.");
  } catch {
    return error(
      id,
      -32000,
      "Analytics request failed. Verify the local read-only credentials and property access.",
    );
  }
}

export async function runStdioServer(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
) {
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      const response = await handleMcpRequest(
        JSON.parse(line) as JsonRpcRequest,
      );
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch {
      output.write(
        `${JSON.stringify(error(null, -32700, "Invalid JSON-RPC request."))}\n`,
      );
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runStdioServer().catch(() => process.exit(1));
}
