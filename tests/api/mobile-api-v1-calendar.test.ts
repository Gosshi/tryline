import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const matchesMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));

const contentMock = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const serverMock = vi.hoisted(() => ({
  getBroadcastUrlsForMatches: vi.fn(),
  getV1BroadcastsForMatches: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-content", () => contentMock);
vi.mock("@/lib/api/v1/server", () => serverMock);

const match = {
  awayScore: 17,
  awayTeam: {
    flagCode: "🇫🇷",
    id: "away-id",
    name: "フランス",
    shortCode: "FRA",
    slug: "france",
  },
  competition: {
    family: "six-nations",
    name: "Six Nations",
    nameJa: "シックスネーションズ",
    season: "2027",
    slug: "six-nations-2027",
  },
  hasPreview: false,
  hasRecap: false,
  homeScore: 24,
  homeTeam: {
    flagCode: "🇯🇵",
    id: "home-id",
    name: "日本",
    shortCode: "JPN",
    slug: "japan",
  },
  id: "match-1",
  kickoffAt: "2026-07-18T10:00:00.000Z",
  poolName: null,
  round: 1,
  roundName: "Round 1",
  status: "finished",
  venue: "国立競技場",
};

describe("GET /api/v1/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T03:00:00.000Z"));
    matchesMock.getMatchesInRange.mockResolvedValue([match]);
    contentMock.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: true, hasRecap: true },
    });
    serverMock.getBroadcastUrlsForMatches.mockResolvedValue(
      new Map([["match-1", "https://example.com/watch"]]),
    );
    serverMock.getV1BroadcastsForMatches.mockResolvedValue(
      new Map([
        [
          "match-1",
          [
            {
              kind: "tv",
              service_name: "WOWOW プライム",
              url: "https://example.com/wowow",
            },
          ],
        ],
      ]),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current JST Monday-to-Sunday week with Japanese names", async () => {
    const { GET } = await import("@/app/api/v1/calendar/route");
    const response = await GET(new Request("http://localhost/api/v1/calendar"));

    expect(matchesMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-12T15:00:00.000Z",
      "2026-07-19T15:00:00.000Z",
    );
    expect(contentMock.getContentStatusForMatches).toHaveBeenCalledWith([
      "match-1",
    ]);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(await response.json()).toEqual({
      data: {
        matches: [
          {
            away_team: {
              flag_code: "🇫🇷",
              id: "away-id",
              name: "フランス",
              score: 17,
              short_code: "FRA",
              slug: "france",
            },
            broadcast_jp_url: "https://example.com/watch",
            competition: {
              name: "シックスネーションズ",
              season: "2027",
              slug: "six-nations-2027",
            },
            has_broadcasts: true,
            has_preview: true,
            has_recap: true,
            home_team: {
              flag_code: "🇯🇵",
              id: "home-id",
              name: "日本",
              score: 24,
              short_code: "JPN",
              slug: "japan",
            },
            id: "match-1",
            kickoff_utc: "2026-07-18T10:00:00.000Z",
            status: "finished",
          },
        ],
      },
      error: null,
      success: true,
    });
  });

  it("returns has_broadcasts false when only the legacy broadcast URL exists", async () => {
    serverMock.getV1BroadcastsForMatches.mockResolvedValue(new Map());

    const { GET } = await import("@/app/api/v1/calendar/route");
    const response = await GET(new Request("http://localhost/api/v1/calendar"));
    const body = await response.json();

    expect(body.data.matches[0]).toMatchObject({
      broadcast_jp_url: "https://example.com/watch",
      has_broadcasts: false,
    });
  });

  it("converts an explicit inclusive JST date range to UTC", async () => {
    const { GET } = await import("@/app/api/v1/calendar/route");
    const response = await GET(
      new Request(
        "http://localhost/api/v1/calendar?from=2026-07-13&to=2026-07-19",
      ),
    );

    expect(response.status).toBe(200);
    expect(matchesMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-12T15:00:00.000Z",
      "2026-07-19T15:00:00.000Z",
    );
  });

  it.each([
    ["from=2026-07-19&to=2026-07-13", "from must be on or before to"],
    ["from=2026-02-30&to=2026-03-01", "valid ISO 8601 dates"],
    ["from=&to=", "valid ISO 8601 dates"],
    ["from=2026-07-13", "must be provided together"],
    ["from=2026-01-01&to=2026-12-31", "must not exceed 31 days"],
  ])("returns an enveloped 400 for %s", async (query, errorFragment) => {
    const { GET } = await import("@/app/api/v1/calendar/route");
    const response = await GET(
      new Request(`http://localhost/api/v1/calendar?${query}`),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      data: null,
      error: expect.stringContaining(errorFragment),
      success: false,
    });
    expect(matchesMock.getMatchesInRange).not.toHaveBeenCalled();
  });
});
