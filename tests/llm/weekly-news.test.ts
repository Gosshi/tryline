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

  it("performs two focused searches and stores only allowlisted draft items", async () => {
    openAIMock.createWebSearchJsonResponse
      .mockResolvedValueOnce({
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
            category: "injury",
            published_at: "2026-07-17T01:00:00Z",
            confidence: "high",
            source_url: "https://disallowed.example/news/injury",
            summary_ja: "保存してはいけない項目。",
            title_ja: "対象外の出典",
          },
        ],
      }),
      usage: { inputTokens: 20, outputTokens: 30 },
      })
      .mockResolvedValueOnce({
        model: "gpt-4o",
        text: JSON.stringify({
          items: [
            {
              category: "unexpected-category",
              confidence: "unknown",
              published_at: "2026-07-17T01:00:00Z",
              source_url: "https://premiershiprugby.com/news/comment",
              summary_ja: "監督が週末に向けたコメントを発表した。",
              title_ja: "監督のコメント",
            },
            {
              category: "injury",
              confidence: "high",
              published_at: "2026-07-17T01:00:00Z",
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

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledTimes(2);
    const playerInput = openAIMock.createWebSearchJsonResponse.mock.calls[0]?.[0]
      ?.input as string;
    const competitionInput = openAIMock.createWebSearchJsonResponse.mock.calls[1]?.[0]
      ?.input as string;
    expect(playerInput).toContain("player transfers and contract news");
    expect(playerInput).toContain("player or coach comments");
    expect(playerInput).not.toContain("competition news and tournament developments");
    expect(playerInput).not.toContain("injuries that materially affect upcoming rugby");
    expect(competitionInput).toContain("competition news and tournament developments");
    expect(competitionInput).toContain("injuries that materially affect upcoming rugby");
    expect(competitionInput).not.toContain("player transfers and contract news");
    expect(competitionInput).not.toContain("player or coach comments");
    expect(playerInput).toContain("Do not include quotes longer than 15 words");
    expect(competitionInput).toContain("Do not reproduce article text or copyrighted prose");
    expect(playerInput).toContain("Include source_url for every item");
    expect(competitionInput).toContain("only include news published within the target week");
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

  it("deduplicates source URLs across the two focused searches", async () => {
    openAIMock.createWebSearchJsonResponse
      .mockResolvedValueOnce({
        model: "gpt-4o",
        text: JSON.stringify({
          items: [{
            category: "transfer",
            confidence: "high",
            published_at: "2026-07-15T10:00:00Z",
            source_url: "HTTPS://WWW.THERUGBYPAPER.CO.UK/news/same/",
            summary_ja: "同じ出典の移籍ニュース。",
            title_ja: "移籍ニュース",
          }],
        }),
      })
      .mockResolvedValueOnce({
        model: "gpt-4o",
        text: JSON.stringify({
          items: [{
            category: "competition",
            confidence: "medium",
            published_at: "2026-07-16T10:00:00Z",
            source_url: "https://www.therugbypaper.co.uk/news/same",
            summary_ja: "同じ出典の大会ニュース。",
            title_ja: "大会ニュース",
          }],
        }),
      });
    const { fetchWeeklyNews } = await import("@/lib/llm/weekly-news/fetch");

    const result = await fetchWeeklyNews({
      now: new Date("2026-07-17T03:00:00.000Z"),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title_ja: "移籍ニュース" });
    expect(dbMock.insert).toHaveBeenCalledWith([
      expect.objectContaining({ title_ja: "移籍ニュース" }),
    ]);
  });

  it("filters items without a valid publication date or published before the target week", async () => {
    const { parseWeeklyNewsResponse } = await import(
      "@/lib/llm/weekly-news/fetch"
    );

    const items = parseWeeklyNewsResponse(
      JSON.stringify({
        items: [
          {
            category: "transfer",
            confidence: "high",
            published_at: "2026-06-30T12:00:00Z",
            source_url: "https://www.therugbypaper.co.uk/news/old-transfer",
            summary_ja: "対象週より前に公開されたニュース。",
            title_ja: "古い移籍ニュース",
          },
          {
            category: "quote",
            confidence: "medium",
            published_at: null,
            source_url: "https://www.premiershiprugby.com/news/missing-date",
            summary_ja: "公開日時がないニュース。",
            title_ja: "公開日なし",
          },
          {
            category: "competition",
            confidence: "medium",
            published_at: "not-a-date",
            source_url: "https://www.unitedrugby.com/news/invalid-date",
            summary_ja: "不正な公開日時のニュース。",
            title_ja: "不正な公開日",
          },
          {
            category: "injury",
            confidence: "medium",
            published_at: "2026-07-20T00:00:00+09:00",
            source_url: "https://www.englandrugby.com/news/current-week",
            summary_ja: "対象週の開始時刻に公開されたニュース。",
            title_ja: "対象週のニュース",
          },
          {
            category: "other",
            confidence: "medium",
            published_at: "2026-07-27T00:00:00+09:00",
            source_url: "https://www.rugby.com.au/news/future-date",
            summary_ja: "週末より未来の日時は今回許容する。",
            title_ja: "未来日のニュース",
          },
        ],
      }),
      "2026-07-20",
      new Date("2026-07-26T03:00:00.000Z"),
    );

    expect(items.map((item) => item.title_ja)).toEqual([
      "対象週のニュース",
      "未来日のニュース",
    ]);
  });
});
