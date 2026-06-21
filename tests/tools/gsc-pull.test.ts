import { describe, expect, it, vi } from "vitest";

import {
  buildSummaryMarkdown,
  collectSitemapUrls,
  fetchSearchAnalytics,
  formatSearchAnalyticsOutput,
  groupSitemapUrls,
  inspectUrls,
  parseCliOptions,
  parseDateRange,
  parseDimensions,
  selectInspectionTargets,
} from "@/tools/gsc-pull";

describe("gsc-pull", () => {
  it("parses relative and explicit date ranges with a three-day data delay", () => {
    const now = new Date("2026-06-21T12:00:00.000Z");

    expect(parseDateRange("7d", now)).toEqual({
      endDate: "2026-06-18",
      label: "7d",
      startDate: "2026-06-12",
    });
    expect(parseDateRange("28d", now)).toEqual({
      endDate: "2026-06-18",
      label: "28d",
      startDate: "2026-05-22",
    });
    expect(parseDateRange("2026-05-01:2026-05-31", now)).toEqual({
      endDate: "2026-05-31",
      label: "2026-05-01:2026-05-31",
      startDate: "2026-05-01",
    });
    expect(() => parseDateRange("2026-05-31:2026-05-01", now)).toThrow(
      "Invalid --range value",
    );
  });

  it("parses dimensions and CLI defaults", () => {
    const now = new Date("2026-06-21T00:00:00.000Z");

    expect(parseDimensions("query,page,date")).toEqual([
      "query",
      "page",
      "date",
    ]);
    expect(() => parseDimensions("query,invalid")).toThrow(
      "Invalid --dims value",
    );
    expect(parseCliOptions([], now)).toEqual({
      dimensions: ["query", "page"],
      inspectGroups: [],
      inspectLimit: 50,
      range: {
        endDate: "2026-06-18",
        label: "28d",
        startDate: "2026-05-22",
      },
      rowLimit: 1_000,
    });
    expect(
      parseCliOptions(
        [
          "--range=7d",
          "--dims",
          "page,device",
          "--row-limit",
          "25000",
          "--inspect",
          "teams,matches",
          "--inspect-limit=25",
        ],
        now,
      ),
    ).toMatchObject({
      dimensions: ["page", "device"],
      inspectGroups: ["teams", "matches"],
      inspectLimit: 25,
      rowLimit: 25_000,
    });
    expect(() =>
      parseCliOptions(["--inspect", "all", "--inspect-limit", "401"], now),
    ).toThrow("could exceed the 2000/day quota");
  });

  it("follows sitemap indexes and groups real route prefixes", async () => {
    const responses = new Map([
      [
        "https://www.trylinerugby.com/sitemap.xml",
        `<?xml version="1.0"?><sitemapindex>
          <sitemap><loc>https://www.trylinerugby.com/sitemap-pages.xml</loc></sitemap>
        </sitemapindex>`,
      ],
      [
        "https://www.trylinerugby.com/sitemap-pages.xml",
        `<?xml version="1.0"?><urlset>
          <url><loc>https://www.trylinerugby.com/players/a</loc></url>
          <url><loc>https://www.trylinerugby.com/teams/b</loc></url>
          <url><loc>https://www.trylinerugby.com/t/b</loc></url>
          <url><loc>https://www.trylinerugby.com/c/six-nations/2027</loc></url>
          <url><loc>https://www.trylinerugby.com/matches/1</loc></url>
          <url><loc>https://www.trylinerugby.com/h2h/a-vs-b</loc></url>
          <url><loc>https://www.trylinerugby.com/pricing</loc></url>
        </urlset>`,
      ],
    ]);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const body = responses.get(String(url));
      return new Response(body ?? "", { status: body ? 200 : 404 });
    });

    const urls = await collectSitemapUrls({
      fetchImpl: fetchImpl as typeof fetch,
      sitemapUrl: "https://www.trylinerugby.com/sitemap.xml",
      siteOrigin: "https://www.trylinerugby.com",
    });
    const grouped = groupSitemapUrls(urls);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(grouped).toEqual([
      expect.objectContaining({ group: "players", prefix: "/players/" }),
      expect.objectContaining({ group: "teams", prefix: "/teams/" }),
      expect.objectContaining({ group: "teams", prefix: "/t/" }),
      expect.objectContaining({ group: "competitions", prefix: "/c/" }),
      expect.objectContaining({ group: "matches", prefix: "/matches/" }),
      expect.objectContaining({ group: "h2h", prefix: "/h2h/" }),
    ]);
    expect(selectInspectionTargets(grouped, 1)).toEqual([
      expect.objectContaining({ group: "players" }),
      expect.objectContaining({ group: "teams", prefix: "/teams/" }),
      expect.objectContaining({ group: "competitions" }),
      expect.objectContaining({ group: "matches" }),
      expect.objectContaining({ group: "h2h" }),
    ]);
  });

  it("queries Search Analytics with parsed dimensions and formats rows", async () => {
    const query = vi.fn().mockResolvedValue({
      data: {
        rows: [
          {
            clicks: 3,
            ctr: 0.25,
            impressions: 12,
            keys: ["rugby query", "https://www.trylinerugby.com/matches/1"],
            position: 8.5,
          },
        ],
      },
    });
    const range = {
      endDate: "2026-06-18",
      label: "7d",
      startDate: "2026-06-12",
    };
    const output = await fetchSearchAnalytics({
      client: { searchanalytics: { query } },
      dimensions: ["query", "page"],
      range,
      rowLimit: 100,
      siteUrl: "sc-domain:trylinerugby.com",
    });

    expect(query).toHaveBeenCalledWith({
      requestBody: {
        dimensions: ["query", "page"],
        endDate: "2026-06-18",
        rowLimit: 100,
        startDate: "2026-06-12",
        startRow: 0,
      },
      siteUrl: "sc-domain:trylinerugby.com",
    });
    expect(output).toEqual({
      meta: {
        dims: ["query", "page"],
        range,
        siteUrl: "sc-domain:trylinerugby.com",
        totalRows: 1,
      },
      rows: [
        {
          clicks: 3,
          ctr: 0.25,
          impressions: 12,
          keys: {
            page: "https://www.trylinerugby.com/matches/1",
            query: "rugby query",
          },
          position: 8.5,
        },
      ],
    });
  });

  it("formats missing API metrics and creates a readable summary", () => {
    const search = formatSearchAnalyticsOutput({
      dimensions: ["query", "page"],
      range: {
        endDate: "2026-06-18",
        label: "7d",
        startDate: "2026-06-12",
      },
      rows: [{ keys: ["tryline", "https://www.trylinerugby.com/"] }],
      siteUrl: "sc-domain:trylinerugby.com",
    });
    const summary = buildSummaryMarkdown({
      inspectionRows: [
        {
          coverageState: "Submitted and indexed",
          googleCanonical: null,
          group: "teams",
          indexingState: "INDEXING_ALLOWED",
          lastCrawlTime: null,
          prefix: "/teams/",
          robotsTxtState: "ALLOWED",
          url: "https://www.trylinerugby.com/teams/a",
          userCanonical: null,
          verdict: "PASS",
        },
        {
          coverageState: "Crawled - currently not indexed",
          googleCanonical: null,
          group: "teams",
          indexingState: "INDEXING_ALLOWED",
          lastCrawlTime: null,
          prefix: "/t/",
          robotsTxtState: "ALLOWED",
          url: "https://www.trylinerugby.com/t/a",
          userCanonical: null,
          verdict: "NEUTRAL",
        },
      ],
      search,
    });

    expect(search.rows[0]).toMatchObject({
      clicks: 0,
      ctr: 0,
      impressions: 0,
      position: 0,
    });
    expect(summary).toContain("| teams | `/teams/` | 1 | 1 | 0 |");
    expect(summary).toContain("| teams | `/t/` | 1 | 0 | 1 |");
  });

  it("formats mocked URL Inspection responses", async () => {
    const inspect = vi.fn().mockResolvedValue({
      data: {
        inspectionResult: {
          indexStatusResult: {
            coverageState: "Submitted and indexed",
            googleCanonical: "https://www.trylinerugby.com/matches/1",
            indexingState: "INDEXING_ALLOWED",
            lastCrawlTime: "2026-06-20T00:00:00Z",
            robotsTxtState: "ALLOWED",
            userCanonical: "https://www.trylinerugby.com/matches/1",
            verdict: "PASS",
          },
        },
      },
    });
    const rows = await inspectUrls({
      client: { urlInspection: { index: { inspect } } },
      delayMs: 0,
      siteUrl: "sc-domain:trylinerugby.com",
      targets: [
        {
          group: "matches",
          prefix: "/matches/",
          url: "https://www.trylinerugby.com/matches/1",
        },
      ],
    });

    expect(inspect).toHaveBeenCalledWith({
      requestBody: {
        inspectionUrl: "https://www.trylinerugby.com/matches/1",
        languageCode: "ja-JP",
        siteUrl: "sc-domain:trylinerugby.com",
      },
    });
    expect(rows).toEqual([
      expect.objectContaining({
        coverageState: "Submitted and indexed",
        group: "matches",
        indexingState: "INDEXING_ALLOWED",
        prefix: "/matches/",
        verdict: "PASS",
      }),
    ]);
  });
});
