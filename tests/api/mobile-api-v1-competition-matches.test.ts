import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  listMatchesForCompetition: vi.fn(),
}));

const contentMock = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const serverMock = vi.hoisted(() => ({
  getBroadcastUrlsForMatches: vi.fn(),
  getV1BroadcastsForMatches: vi.fn(),
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-content", () => contentMock);
vi.mock("@/lib/api/v1/server", () => serverMock);

const competition = {
  champion: null,
  endDate: "2027-03-20",
  family: "six-nations",
  id: "competition-1",
  matchCount: 15,
  name: "Six Nations",
  nameJa: "シックスネーションズ",
  publishedContentCount: 4,
  season: "2027",
  slug: "six-nations-2027",
  startDate: "2027-02-05",
};

const match = {
  awayScore: 17,
  awayTeam: {
    flagCode: "🇫🇷",
    id: "away-id",
    name: "フランス",
    shortCode: "FRA",
    slug: "france",
  },
  homeScore: 24,
  homeTeam: {
    flagCode: "🇯🇵",
    id: "home-id",
    name: "日本",
    shortCode: "JPN",
    slug: "japan",
  },
  id: "match-1",
  kickoffAt: "2027-02-05T20:00:00.000Z",
  poolName: null,
  round: 1,
  roundName: "Round 1",
  status: "finished",
  venue: "Stade de France",
};

describe("GET /api/v1/competitions/[slug]/matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionsMock.getCompetitionBySlug.mockResolvedValue(competition);
    matchesMock.listMatchesForCompetition.mockResolvedValue([match]);
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
          [{ kind: "tv", service_name: "WOWOW", url: "https://example.com" }],
        ],
      ]),
    );
  });

  async function requestMatches(slug = "six-nations-2027") {
    const { GET } =
      await import("@/app/api/v1/competitions/[slug]/matches/route");

    return GET(
      new Request(`http://localhost/api/v1/competitions/${slug}/matches`),
      { params: Promise.resolve({ slug }) },
    );
  }

  it("returns competition matches in the V1CalendarMatch shape", async () => {
    const response = await requestMatches();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(matchesMock.listMatchesForCompetition).toHaveBeenCalledWith(
      "six-nations-2027",
    );
    expect(contentMock.getContentStatusForMatches).toHaveBeenCalledWith([
      "match-1",
    ]);
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
            kickoff_utc: "2027-02-05T20:00:00.000Z",
            status: "finished",
          },
        ],
      },
      error: null,
      success: true,
    });
  });

  it("returns an empty array for a competition without matches", async () => {
    matchesMock.listMatchesForCompetition.mockResolvedValue([]);
    contentMock.getContentStatusForMatches.mockResolvedValue({});

    const response = await requestMatches();

    expect((await response.json()).data.matches).toEqual([]);
  });

  it("returns an enveloped 404 for an unknown competition", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue(null);

    const response = await requestMatches("missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      data: null,
      error: "competition not found",
      success: false,
    });
    expect(matchesMock.listMatchesForCompetition).not.toHaveBeenCalled();
  });
});
