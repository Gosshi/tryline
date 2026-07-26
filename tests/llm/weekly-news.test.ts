import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));

const openAIMock = vi.hoisted(() => ({
  createWebSearchJsonResponse: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: dbMock.from }),
}));
vi.mock("@/lib/llm/openai", () => openAIMock);

describe("weekly news fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.from.mockReturnValue({ insert: dbMock.insert });
    dbMock.insert.mockResolvedValue({ error: null });
  });

  it("performs one weekly search and stores only allowlisted draft items", async () => {
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o",
      text: JSON.stringify({
        items: [
          {
            category: "transfer",
            confidence: "high",
            published_at: "2026-07-15T10:00:00Z",
            source_url: "https://www.therugbypaper.co.uk/news/transfer",
            summary_ja: "クラブは新加入選手を発表した。",
            title_ja: "新加入を発表",
          },
          {
            category: "unexpected-category",
            confidence: "unknown",
            source_url: "https://premiershiprugby.com/news/comment",
            summary_ja: "監督が週末に向けたコメントを発表した。",
            title_ja: "監督のコメント",
          },
          {
            category: "injury",
            confidence: "high",
            source_url: "https://disallowed.example/news/injury",
            summary_ja: "保存してはいけない項目。",
            title_ja: "対象外の出典",
          },
        ],
      }),
      usage: { inputTokens: 20, outputTokens: 30 },
    });
    const { fetchWeeklyNews } = await import("@/lib/llm/weekly-news/fetch");

    const result = await fetchWeeklyNews({
      now: new Date("2026-07-17T03:00:00.000Z"),
    });

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledOnce();
    const input = openAIMock.createWebSearchJsonResponse.mock.calls[0]?.[0]
      ?.input as string;
    expect(input).toContain("Do not include quotes longer than 15 words");
    expect(input).toContain("Do not reproduce article text or copyrighted prose");
    expect(input).toContain("Include source_url for every item");
    expect(result.week).toEqual({ from: "2026-07-13", to: "2026-07-19" });
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toMatchObject({
      category: "other",
      confidence: "medium",
      source_domain: "premiershiprugby.com",
      status: "draft",
    });
    expect(dbMock.from).toHaveBeenCalledWith("weekly_news_items");
    expect(dbMock.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        category: "transfer",
        source_domain: "therugbypaper.co.uk",
        status: "draft",
        week_from: "2026-07-13",
        week_to: "2026-07-19",
      }),
      expect.objectContaining({ category: "other", status: "draft" }),
    ]);
  });

  it("accepts an empty or fully disallowed result without writing rows", async () => {
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o",
      text: JSON.stringify({
        items: [
          {
            category: "competition",
            confidence: "medium",
            source_url: "https://disallowed.example/news",
            summary_ja: "保存されないニュース。",
            title_ja: "保存されない",
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const { fetchWeeklyNews } = await import("@/lib/llm/weekly-news/fetch");

    await expect(
      fetchWeeklyNews({
        now: new Date("2026-07-17T03:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ fetched: true, items: [] });
    expect(dbMock.from).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
