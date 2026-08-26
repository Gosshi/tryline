import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  assertCronAuthorized: vi.fn(),
  CronUnauthorizedError: class CronUnauthorizedError extends Error {},
}));
const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));
const envMock = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  hasConfiguredValue: vi.fn(),
}));
const newsLinksMock = vi.hoisted(() => ({
  fetchNewsLinks: vi.fn(),
  formatNewsLinkNotification: vi.fn(),
  matchNewsLink: vi.fn(),
  translateNewsTitle: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => authMock);
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => dbMock }));
vi.mock("@/lib/env", () => envMock);
vi.mock("@/lib/news-links", () => newsLinksMock);

const matchedFixture = {
  awayTeamName: "New Zealand",
  homeTeamName: "South Africa",
  id: "match-1",
  kickoffAt: "2026-08-30T00:00:00.000Z",
};

function link(index: number) {
  return {
    publishedAt: "2026-08-26T00:00:00.000Z",
    sourceDomain: "example.test",
    sourceUrl: `https://example.test/${index}`,
    title: `article ${index}`,
  };
}

function setupDatabase() {
  const maybeSingle = vi.fn();
  const selectSaved = vi.fn(() => ({ maybeSingle }));
  const upsert = vi.fn(() => ({ select: selectSaved }));
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const lte = vi.fn().mockResolvedValue({ data: [], error: null });
  const gte = vi.fn(() => ({ lte }));
  const selectMatches = vi.fn(() => ({ gte }));

  dbMock.from.mockImplementation((table: string) =>
    table === "matches"
      ? { select: selectMatches }
      : { update, upsert },
  );
  maybeSingle.mockImplementation(async () => ({
    data: { id: crypto.randomUUID(), notified_at: null },
    error: null,
  }));

  return { maybeSingle, upsert };
}

describe("/api/cron/collect-news-links", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    envMock.getServerEnv.mockReturnValue({
      DISCORD_WEBHOOK_OPS: "https://discord.test/webhook",
    });
    envMock.hasConfiguredValue.mockReturnValue(true);
    newsLinksMock.formatNewsLinkNotification.mockReturnValue("notification");
    newsLinksMock.translateNewsTitle.mockResolvedValue("日本語見出し");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("stops before saving or notifying links after the notification limit", async () => {
    const { upsert } = setupDatabase();
    newsLinksMock.fetchNewsLinks.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => link(index)),
    );
    newsLinksMock.matchNewsLink.mockReturnValue(matchedFixture);
    const { POST } = await import("@/app/api/cron/collect-news-links/route");

    const response = await POST(new Request("http://localhost"));

    expect(await response.json()).toEqual({
      fetched: 21,
      matched: 20,
      notified: 20,
      status: "ok",
      truncated: true,
    });
    expect(upsert).toHaveBeenCalledTimes(20);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ source_url: "https://example.test/0" }),
      { ignoreDuplicates: true, onConflict: "source_url" },
    );
    expect(newsLinksMock.translateNewsTitle).toHaveBeenCalledTimes(
      20,
    );
    expect(fetch).toHaveBeenCalledTimes(20);
  });

  it("does not consume the notification limit for unmatched links", async () => {
    const { upsert } = setupDatabase();
    newsLinksMock.fetchNewsLinks.mockResolvedValue([
      { ...link(0), title: "unmatched" },
      ...Array.from({ length: 20 }, (_, index) => link(index + 1)),
      link(21),
    ]);
    newsLinksMock.matchNewsLink.mockImplementation((title: string) =>
      title === "unmatched" ? null : matchedFixture,
    );
    const { POST } = await import("@/app/api/cron/collect-news-links/route");

    const response = await POST(new Request("http://localhost"));

    expect(await response.json()).toEqual({
      fetched: 22,
      matched: 20,
      notified: 20,
      status: "ok",
      truncated: true,
    });
    expect(upsert).toHaveBeenCalledTimes(21);
  });

  it("reports an untruncated response when fewer notifications are sent", async () => {
    setupDatabase();
    newsLinksMock.fetchNewsLinks.mockResolvedValue([link(0), link(1)]);
    newsLinksMock.matchNewsLink.mockReturnValue(matchedFixture);
    const { POST } = await import("@/app/api/cron/collect-news-links/route");

    const response = await POST(new Request("http://localhost"));

    expect(await response.json()).toMatchObject({
      fetched: 2,
      matched: 2,
      notified: 2,
      status: "ok",
      truncated: false,
    });
  });
});
