import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: dbMock.from }),
}));

describe("weekly news queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.from.mockReturnValue({ select: dbMock.select });
    dbMock.select.mockReturnValue({ eq: dbMock.eq });
    dbMock.eq.mockReturnValue({ eq: dbMock.eq, order: dbMock.order });
    dbMock.order.mockResolvedValue({ data: [], error: null });
  });

  it("selects only published items for the requested week", async () => {
    const { getPublishedWeeklyNewsItems } = await import(
      "@/lib/db/queries/weekly-news"
    );

    await expect(
      getPublishedWeeklyNewsItems("2026-07-13", "2026-07-19"),
    ).resolves.toEqual([]);

    expect(dbMock.from).toHaveBeenCalledWith("weekly_news_items");
    expect(dbMock.eq).toHaveBeenNthCalledWith(1, "week_from", "2026-07-13");
    expect(dbMock.eq).toHaveBeenNthCalledWith(2, "week_to", "2026-07-19");
    expect(dbMock.eq).toHaveBeenNthCalledWith(3, "status", "published");
    expect(dbMock.order).toHaveBeenCalledWith("published_at", {
      ascending: false,
      nullsFirst: false,
    });
  });
});
