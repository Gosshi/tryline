import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const weeklyNewsMock = vi.hoisted(() => ({
  getPublishedWeeklyNewsItems: vi.fn(),
}));

vi.mock("@/lib/db/queries/weekly-news", () => weeklyNewsMock);

describe("GET /api/v1/stories/weekly-news", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only the current week's published items with stable image URLs", async () => {
    weeklyNewsMock.getPublishedWeeklyNewsItems.mockResolvedValue([
      {
        category: "transfer",
        id: "news-1",
        published_at: "2026-07-15T10:00:00.000Z",
        source_domain: "therugbypaper.co.uk",
        source_url: "https://www.therugbypaper.co.uk/news/transfer",
        summary_ja: "クラブは新加入選手を発表した。",
        title_ja: "新加入を発表",
      },
      {
        category: "unknown",
        id: "news-2",
        published_at: null,
        source_domain: "premiershiprugby.com",
        source_url: "https://www.premiershiprugby.com/news/comment",
        summary_ja: "監督がコメントを発表した。",
        title_ja: "監督のコメント",
      },
    ]);
    const { GET } = await import("@/app/api/v1/stories/weekly-news/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(weeklyNewsMock.getPublishedWeeklyNewsItems).toHaveBeenCalledWith(
      "2026-07-13",
      "2026-07-19",
    );
    expect(body.data.week).toEqual({
      from: "2026-07-13",
      label: "7月13日 - 19日 JST",
      to: "2026-07-19",
    });
    expect(body.data.items).toEqual([
      expect.objectContaining({
        category: "transfer",
        id: "news-1",
        image: {
          landscape_url: expect.stringContaining(
            "type=weekly-news&category=transfer&item=news-1&text=none",
          ),
          portrait_url: expect.stringContaining("orientation=portrait"),
        },
      }),
      expect.objectContaining({ category: "other", id: "news-2" }),
    ]);
  });

  it("returns an empty 200 response when the week has no published items", async () => {
    weeklyNewsMock.getPublishedWeeklyNewsItems.mockResolvedValue([]);
    const { GET } = await import("@/app/api/v1/stories/weekly-news/route");

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      data: { items: [] },
      error: null,
      success: true,
    });
    expect(response.status).toBe(200);
  });
});
