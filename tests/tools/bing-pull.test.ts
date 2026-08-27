import { describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => fsMocks);

import {
  BING_API_BASE_URL,
  BING_READONLY_METHODS,
  buildBingApiUrl,
  buildSummaryMarkdown,
  normalizeRankAndTrafficStats,
  parseCliOptions,
  parseMicrosoftDate,
  pullBingData,
  requireBingApiKey,
  requestBingApi,
  writeBingOutputs,
} from "@/tools/bing-pull";

const apiKey = "bing-secret-key";
const siteUrl = "https://www.trylinerugby.com/";

async function errorMessage(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Expected the action to throw.");
}

describe("bing-pull", () => {
  it("uses only the JSON endpoint and the four read-only API methods", () => {
    const url = buildBingApiUrl({
      apiKey,
      method: "GetQueryStats",
      siteUrl,
    });

    expect(BING_READONLY_METHODS).toEqual([
      "GetUserSites",
      "GetRankAndTrafficStats",
      "GetQueryStats",
      "GetPageStats",
    ]);
    expect(url.startsWith(`${BING_API_BASE_URL}/GetQueryStats`)).toBe(true);
    expect(url).toContain("siteUrl=https%3A%2F%2Fwww.trylinerugby.com%2F");
  });

  it("rejects methods outside the allowlist before sending a request", async () => {
    const fetchImpl = vi.fn();

    await expect(
      requestBingApi({
        apiKey,
        fetchImpl,
        method: "SubmitUrl",
        siteUrl,
      }),
    ).rejects.toThrow("Bing API method is not allowed: SubmitUrl");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a missing or invalid methods value with the supported values", () => {
    expect(parseCliOptions([])).toEqual({
      methods: ["traffic", "query", "page"],
      outputDirectory: "tmp/bing",
    });
    expect(() => parseCliOptions(["--methods", "traffic,unknown"])).toThrow(
      "Invalid --methods value: traffic,unknown. Supported methods: page,query,sites,traffic.",
    );
  });

  it("reports when the Bing API key is not configured without exposing a value", () => {
    expect(() => requireBingApiKey(undefined)).toThrow(
      "BING_API_KEY is not set.",
    );
  });

  it("does not leak an API key from a network error", async () => {
    const message = await errorMessage(() =>
      requestBingApi({
        apiKey,
        fetchImpl: vi
          .fn()
          .mockRejectedValue(new Error(`network failed with ${apiKey}`)),
        method: "GetQueryStats",
        siteUrl,
      }),
    );

    expect(message).toContain("Bing API network request failed");
    expect(message).toContain("apikey=***");
    expect(message).not.toContain(apiKey);
  });

  it("does not leak an API key from an HTTP error", async () => {
    const message = await errorMessage(() =>
      requestBingApi({
        apiKey,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 503 })),
        method: "GetQueryStats",
        siteUrl,
      }),
    );

    expect(message).toContain("Bing API HTTP error 503");
    expect(message).toContain("apikey=***");
    expect(message).not.toContain(apiKey);
  });

  it("does not leak an API key from an API error", async () => {
    const message = await errorMessage(() =>
      requestBingApi({
        apiKey,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ ErrorCode: 2, Message: `invalid ${apiKey}` }),
              { headers: { "Content-Type": "application/json" }, status: 200 },
            ),
          ),
        method: "GetQueryStats",
        siteUrl,
      }),
    );

    expect(message).toContain("Bing API error 2: invalid ***");
    expect(message).not.toContain(apiKey);
  });

  it("unwraps Bing responses and sends the selected read-only requests", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const method = url.pathname.split("/").at(-1);
      const responses: Record<string, unknown> = {
        GetPageStats: [{ Url: "https://www.trylinerugby.com/c/nc", Clicks: 4 }],
        GetQueryStats: [{ Query: "ラグビー", Clicks: 3 }],
        GetRankAndTrafficStats: [
          { Clicks: 2, Date: "/Date(1316156400000-0700)/", Impressions: 10 },
        ],
        GetUserSites: [{ Url: siteUrl }],
      };
      return new Response(JSON.stringify({ d: responses[method ?? ""] }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const results = await pullBingData({
      apiKey,
      fetchImpl: fetchImpl as typeof fetch,
      methods: ["sites", "traffic", "query", "page"],
      siteUrl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain("siteUrl=");
    expect(results).toMatchObject({
      pageStats: [{ Clicks: 4 }],
      queryStats: [{ Clicks: 3 }],
      rankAndTrafficStats: [{ Clicks: 2, date: "2011-09-16" }],
      userSites: [{ Url: siteUrl }],
    });
  });

  it("parses Microsoft dates as UTC calendar dates", () => {
    expect(parseMicrosoftDate("/Date(1316156400000-0700)/")).toBe("2011-09-16");
  });

  it("keeps rows with invalid dates and reports one warning", () => {
    const warn = vi.fn();
    const rows = normalizeRankAndTrafficStats(
      [{ Clicks: 2, Date: "not-a-date", Impressions: 10 }],
      warn,
    );

    expect(rows).toEqual([{ Clicks: 2, Impressions: 10, date: null }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("writes data without API keys or request URLs and summarizes Bing verticals", async () => {
    fsMocks.mkdir.mockResolvedValue(undefined);
    fsMocks.writeFile.mockResolvedValue(undefined);

    await writeBingOutputs({
      outputDirectory: "tmp/bing",
      results: {
        pageStats: [{ Clicks: 5, Impressions: 20, Url: "/c/nc" }],
        queryStats: [{ Clicks: 4, Impressions: 10, Query: "ラグビー" }],
        rankAndTrafficStats: [
          { Clicks: 3, Impressions: 12, date: "2026-08-27" },
        ],
      },
      siteUrl,
      timestamp: new Date("2026-08-27T00:00:00.000Z"),
    });

    const writtenContents = fsMocks.writeFile.mock.calls.map(([, content]) =>
      String(content),
    );
    expect(writtenContents).toHaveLength(4);
    expect(writtenContents.join("\n")).not.toContain(apiKey);
    expect(writtenContents.join("\n")).not.toContain(BING_API_BASE_URL);
    expect(writtenContents.at(-1)).toContain("Web, Chat, News, Images, Videos");
  });

  it("builds a summary with totals and top rows", () => {
    const summary = buildSummaryMarkdown({
      pageStats: [{ Clicks: 5, Impressions: 20, Url: "/c/nc" }],
      queryStats: [{ Clicks: 4, Impressions: 10, Query: "ラグビー" }],
      rankAndTrafficStats: [{ Clicks: 3, Impressions: 12, date: "2026-08-27" }],
      siteUrl,
    });

    expect(summary).toContain("- Total Clicks: 3");
    expect(summary).toContain("- Total Impressions: 12");
    expect(summary).toContain("| ラグビー | 4 | 10 |");
    expect(summary).toContain("| /c/nc | 5 | 20 |");
  });
});
