import { describe, expect, it, vi } from "vitest";

const fetcherMock = vi.hoisted(() => ({ fetchWithPolicy: vi.fn() }));
vi.mock("@/lib/scrapers/fetcher", () => fetcherMock);

import {
  NEWS_FEEDS,
  fetchNewsLinks,
  formatNewsLinkNotification,
  matchNewsLink,
  parseRss,
} from "@/lib/news-links";

const RSS = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[South Africa name squad]]></title><link>https://example.test/article</link><description>Must not be read</description><pubDate>Tue, 26 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`;

describe("news links", () => {
  it("parses only title, URL, and publication time from an RSS item", () => {
    expect(parseRss(RSS, "example.test")).toEqual([
      expect.objectContaining({
        sourceDomain: "example.test",
        sourceUrl: "https://example.test/article",
        title: "South Africa name squad",
      }),
    ]);
  });

  it("fetches only configured RSS feed URLs", async () => {
    fetcherMock.fetchWithPolicy.mockResolvedValue({
      text: () => Promise.resolve(RSS),
    });
    await fetchNewsLinks();
    expect(fetcherMock.fetchWithPolicy).toHaveBeenCalledTimes(
      NEWS_FEEDS.length,
    );
    expect(
      fetcherMock.fetchWithPolicy.mock.calls.map((call) => call[0]),
    ).toEqual(NEWS_FEEDS.map((feed) => feed.url));
  });

  it("matches titles mechanically to the closest upcoming match", () => {
    expect(
      matchNewsLink("South Africa squad", [
        {
          id: "later",
          kickoffAt: "2026-09-02T00:00:00Z",
          homeTeamName: "South Africa",
          awayTeamName: "Australia",
        },
        {
          id: "soon",
          kickoffAt: "2026-08-30T00:00:00Z",
          homeTeamName: "South Africa",
          awayTeamName: "New Zealand",
        },
      ])?.id,
    ).toBe("soon");
  });

  it("includes a machine-readable match id in notifications", () => {
    expect(
      formatNewsLinkNotification({
        match: {
          id: "match-1",
          kickoffAt: "2026-08-30T00:00:00Z",
          homeTeamName: "南アフリカ",
          awayTeamName: "ニュージーランド",
        },
        title: "日本語見出し",
        url: "https://example.test/article",
      }),
    ).toContain("match_id: match-1");
  });
});
