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
const ATOM = `<feed><entry><title>All Blacks selection race</title><link href="https://stuff.co.nz/article"/><summary>Must not be read</summary><published>2026-08-26T00:00:00Z</published></entry></feed>`;

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

  it("parses Atom entries with href links and publication dates", () => {
    expect(parseRss(ATOM, "stuff.co.nz")[0]).toMatchObject({
      publishedAt: "2026-08-26T00:00:00.000Z",
      sourceUrl: "https://stuff.co.nz/article",
      title: "All Blacks selection race",
    });
  });

  it("matches titles mechanically to the closest upcoming match", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00Z"));
    expect(
      matchNewsLink(
        "Springbok captain Siya Kolisi cleared to face All Blacks in second test",
        [
          {
            id: "past",
            kickoffAt: "2026-08-25T00:00:00Z",
            homeTeamName: "South Africa",
            awayTeamName: "New Zealand",
          },
          {
            id: "soon",
            kickoffAt: "2026-08-30T00:00:00Z",
            homeTeamName: "South Africa",
            awayTeamName: "New Zealand",
          },
        ],
      )?.id,
    ).toBe("soon");
    vi.useRealTimers();
  });

  it("falls back to the most recent past match", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00Z"));
    expect(
      matchNewsLink("France squad", [
        {
          id: "old",
          kickoffAt: "2026-08-20T00:00:00Z",
          homeTeamName: "France",
          awayTeamName: "Italy",
        },
        {
          id: "recent",
          kickoffAt: "2026-08-25T00:00:00Z",
          homeTeamName: "France",
          awayTeamName: "Italy",
        },
      ])?.id,
    ).toBe("recent");
    vi.useRealTimers();
  });

  it("matches aliases while keeping short aliases word-boundary-safe", () => {
    const matches = [
      {
        id: "australia",
        kickoffAt: "2026-08-30T00:00:00Z",
        homeTeamName: "Australia",
        awayTeamName: "Japan",
      },
      {
        id: "south-africa",
        kickoffAt: "2026-08-30T00:00:00Z",
        homeTeamName: "South Africa",
        awayTeamName: "Fiji",
      },
    ];

    expect(matchNewsLink("Wallabies squad", matches)?.id).toBe("australia");
    expect(matchNewsLink("ブレイブブロッサムズ squad", matches)?.id).toBe(
      "australia",
    );
    expect(matchNewsLink("Boks squad", matches)?.id).toBe("south-africa");
    expect(matchNewsLink("notboks squad", matches)).toBeNull();
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
