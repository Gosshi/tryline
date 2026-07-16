import { beforeEach, describe, expect, it, vi } from "vitest";

const matchesMock = vi.hoisted(() => ({
  getMatchById: vi.fn(),
}));

const eventsMock = vi.hoisted(() => ({
  getMatchEventsForMatch: vi.fn(),
}));

const lineupsMock = vi.hoisted(() => ({
  getMatchLineupsForMatch: vi.fn(),
}));

const serverMock = vi.hoisted(() => ({
  getBroadcastUrlsForMatches: vi.fn(),
  getV1BroadcastsForMatches: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-events", () => eventsMock);
vi.mock("@/lib/db/queries/match-lineups", () => lineupsMock);
vi.mock("@/lib/api/v1/server", () => serverMock);

const match = {
  awayScore: 17,
  awayTeam: {
    englishName: "France",
    flagCode: "🇫🇷",
    name: "フランス",
    shortCode: "FRA",
    slug: "france",
  },
  awayTeamId: "away-id",
  competition: {
    family: "six-nations",
    name: "Six Nations",
    nameJa: "シックスネーションズ",
    season: "2027",
    slug: "six-nations-2027",
  },
  homeScore: 24,
  homeTeam: {
    englishName: "Japan",
    flagCode: "🇯🇵",
    name: "日本",
    shortCode: "JPN",
    slug: "japan",
  },
  homeTeamId: "home-id",
  id: "match-1",
  kickoffAt: "2026-07-18T10:00:00.000Z",
  poolName: "Pool A",
  round: 1,
  roundName: "Round 1",
  status: "finished",
  venue: "国立競技場",
};

describe("GET /api/v1/matches/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchesMock.getMatchById.mockResolvedValue(match);
    eventsMock.getMatchEventsForMatch.mockResolvedValue([
      {
        id: "event-1",
        isPenaltyTry: false,
        minute: 12,
        playerName: "山田 太郎",
        points: 5,
        teamId: "home-id",
        type: "try",
      },
    ]);
    lineupsMock.getMatchLineupsForMatch.mockResolvedValue([
      {
        isStarter: true,
        jerseyNumber: 10,
        playerName: "山田 太郎",
        playerSlug: "taro-yamada",
        position: "Fly-half",
        teamId: "home-id",
      },
    ]);
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
            {
              kind: "streaming",
              service_name: "J SPORTS オンデマンド",
              url: "https://example.com/jsports",
            },
          ],
        ],
      ]),
    );
  });

  it("returns match details with events, lineups and broadcast information", async () => {
    const { GET } = await import("@/app/api/v1/matches/[id]/route");
    const response = await GET(
      new Request("http://localhost/api/v1/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(body).toMatchObject({
      data: {
        match: {
          away_team: {
            english_name: "France",
            flag_code: "🇫🇷",
            id: "away-id",
            name: "フランス",
            short_code: "FRA",
          },
          broadcast_jp_url: "https://example.com/watch",
          broadcasts: [
            {
              kind: "tv",
              service_name: "WOWOW プライム",
              url: "https://example.com/wowow",
            },
            {
              kind: "streaming",
              service_name: "J SPORTS オンデマンド",
              url: "https://example.com/jsports",
            },
          ],
          competition: {
            name: "シックスネーションズ",
          },
          events: [
            {
              id: "event-1",
              player_name: "山田 太郎",
              team_id: "home-id",
              type: "try",
            },
          ],
          home_team: {
            english_name: "Japan",
            flag_code: "🇯🇵",
            id: "home-id",
            name: "日本",
            short_code: "JPN",
          },
          id: "match-1",
          lineups: [
            {
              is_starter: true,
              jersey_number: 10,
              player_name: "山田 太郎",
            },
          ],
        },
      },
      error: null,
      success: true,
    });
    expect(eventsMock.getMatchEventsForMatch).toHaveBeenCalledWith("match-1");
    expect(lineupsMock.getMatchLineupsForMatch).toHaveBeenCalledWith("match-1");
  });

  it("returns an enveloped 404 when the match does not exist", async () => {
    matchesMock.getMatchById.mockResolvedValue(null);
    const missingId = "00000000-0000-4000-8000-000000000000";

    const { GET } = await import("@/app/api/v1/matches/[id]/route");
    const response = await GET(
      new Request(`http://localhost/api/v1/matches/${missingId}`),
      { params: Promise.resolve({ id: missingId }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      data: null,
      error: "match not found",
      success: false,
    });
    expect(eventsMock.getMatchEventsForMatch).not.toHaveBeenCalled();
  });
});
