import { beforeEach, describe, expect, it, vi } from "vitest";

const matchesMock = vi.hoisted(() => ({
  getMatchById: vi.fn(),
  getNextMatchesForTeams: vi.fn(),
  getRelatedPublishedRecapsForMatch: vi.fn(),
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

const sourcedFactsMock = vi.hoisted(() => ({
  getStorySourcedFactsForMatches: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-events", () => eventsMock);
vi.mock("@/lib/db/queries/match-lineups", () => lineupsMock);
vi.mock("@/lib/api/v1/server", () => serverMock);
vi.mock("@/lib/db/queries/sourced-facts", () => sourcedFactsMock);

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
    matchesMock.getNextMatchesForTeams.mockResolvedValue([]);
    matchesMock.getRelatedPublishedRecapsForMatch.mockResolvedValue([]);
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
    sourcedFactsMock.getStorySourcedFactsForMatches.mockResolvedValue([]);
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
          next_team_matches: [],
          related_recaps: [],
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

  it("returns related recaps before deduplicated next matches", async () => {
    const relatedRecap = {
      ...match,
      id: "related-recap",
      kickoffAt: "2026-07-17T10:00:00.000Z",
    };
    const nextMatch = {
      ...match,
      id: "next-match",
      kickoffAt: "2026-07-25T10:00:00.000Z",
    };
    matchesMock.getRelatedPublishedRecapsForMatch.mockResolvedValue([
      relatedRecap,
      match,
    ]);
    matchesMock.getNextMatchesForTeams.mockResolvedValue([
      { match: relatedRecap, teamId: "home-id" },
      { match: nextMatch, teamId: "home-id" },
      { match: nextMatch, teamId: "away-id" },
    ]);
    const { GET } = await import("@/app/api/v1/matches/[id]/route");
    const response = await GET(
      new Request("http://localhost/api/v1/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) },
    );
    const body = await response.json();

    expect(matchesMock.getRelatedPublishedRecapsForMatch).toHaveBeenCalledWith({
      competitionSlug: "six-nations-2027",
      excludeMatchId: "match-1",
      round: 1,
    });
    expect(matchesMock.getNextMatchesForTeams).toHaveBeenCalledWith({
      afterIso: "2026-07-18T10:00:00.000Z",
      excludeMatchId: "match-1",
      teamIds: ["home-id", "away-id"],
    });
    expect(body.data.match.related_recaps).toEqual([
      expect.objectContaining({ has_recap: true, id: "related-recap" }),
    ]);
    expect(body.data.match.next_team_matches).toEqual([
      expect.objectContaining({ has_recap: false, id: "next-match" }),
    ]);
  });

  it("returns only the requested match's pre and post related news", async () => {
    sourcedFactsMock.getStorySourcedFactsForMatches.mockResolvedValue([
      {
        confidence: "high",
        contentType: "preview",
        fact: "試合前の日本語ニュースです。",
        factJa: null,
        fetchedAt: "2026-07-18T09:00:00.000Z",
        id: "pre-fact",
        matchId: "match-1",
        sourceDomain: "preview.example.com",
        sourceUrl: "https://preview.example.com/news",
      },
      {
        confidence: "high",
        contentType: "recap",
        fact: "試合後の日本語ニュースです。",
        factJa: null,
        fetchedAt: "2026-07-18T12:00:00.000Z",
        id: "post-fact",
        matchId: "match-1",
        sourceDomain: "recap.example.com",
        sourceUrl: "https://recap.example.com/news",
      },
      {
        confidence: "high",
        contentType: "preview",
        fact: "別試合のニュースです。",
        factJa: null,
        fetchedAt: "2026-07-18T09:00:00.000Z",
        id: "other-match-fact",
        matchId: "other-match",
        sourceDomain: "other.example.com",
        sourceUrl: "https://other.example.com/news",
      },
    ]);
    const { GET } = await import("@/app/api/v1/matches/[id]/route");
    const response = await GET(
      new Request("http://localhost/api/v1/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) },
    );
    const body = await response.json();

    expect(sourcedFactsMock.getStorySourcedFactsForMatches).toHaveBeenCalledWith(
      ["match-1"],
    );
    expect(body.data.match.related_news).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contains_result: false,
          id: "match-1:news:pre-fact",
          source_url: "https://preview.example.com/news",
        }),
        expect.objectContaining({
          contains_result: true,
          id: "match-1:news:post-fact",
          source_url: "https://recap.example.com/news",
        }),
      ]),
    );
    expect(body.data.match.related_news).toHaveLength(2);
  });

  it("returns an empty related_news array when the match has no news", async () => {
    const { GET } = await import("@/app/api/v1/matches/[id]/route");
    const response = await GET(
      new Request("http://localhost/api/v1/matches/match-1"),
      { params: Promise.resolve({ id: "match-1" }) },
    );

    expect((await response.json()).data.match.related_news).toEqual([]);
  });
});
