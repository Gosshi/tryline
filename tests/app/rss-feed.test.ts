import { describe, expect, it, vi } from "vitest";

const feedMocks = vi.hoisted(() => ({
  listPublishedRecapsForFeed: vi.fn(),
}));

vi.mock("@/lib/db/queries/match-content", () => feedMocks);

describe("RSS feed", () => {
  it("returns a valid RSS response with recent recap items", async () => {
    feedMocks.listPublishedRecapsForFeed.mockResolvedValue([
      {
        awayTeamName: "Team <Away>",
        competitionName: "Premiership 2025-26",
        contentMdJa:
          "# 見出し\n\n**接戦**のレビュー本文です。長い説明が続きます。".repeat(
            10,
          ),
        generatedAt: "2026-07-10T10:00:00.000Z",
        homeTeamName: "Home & Team",
        matchId: "match-1",
      },
    ]);
    const { GET } = await import("@/app/rss.xml/route");

    const response = await GET();
    const xml = await response.text();

    expect(response.headers.get("Content-Type")).toBe(
      "application/rss+xml; charset=utf-8",
    );
    expect(feedMocks.listPublishedRecapsForFeed).toHaveBeenCalledWith(30);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("<item>");
    expect(xml).toContain(
      "<title>Home &amp; Team 対 Team &lt;Away&gt; — Premiership 2025-26</title>",
    );
    expect(xml).toContain(
      "<link>https://www.trylinerugby.com/matches/match-1</link>",
    );
    expect(xml).toContain("<pubDate>Fri, 10 Jul 2026 10:00:00 GMT</pubDate>");
    expect(xml).not.toContain("# 見出し");
    expect(xml).toContain("…</description>");
  });
});
