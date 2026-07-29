import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bearerMock = vi.hoisted(() => ({
  getSupabaseBearerClient: vi.fn(),
  getUserFromBearer: vi.fn(),
}));

const serverMock = vi.hoisted(() => ({
  getMobileUserProfile: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  getNextMatchesForTeams: vi.fn(),
  getSingleNationCompetitionIds: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => bearerMock);
vi.mock("@/lib/api/v1/server", () => serverMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);

function createClient(teamRows: Array<{ id: string }> = []) {
  const inSlugs = vi.fn().mockResolvedValue({ data: teamRows, error: null });
  const select = vi.fn(() => ({ in: inSlugs }));
  const from = vi.fn(() => ({ select }));

  return { client: { from }, from, inSlugs, select };
}

function createMatch(overrides: Record<string, unknown> = {}) {
  return {
    awayScore: null,
    awayTeam: {
      flagCode: "🇫🇷",
      id: "france-id",
      name: "フランス",
      shortCode: "FRA",
      slug: "france",
    },
    competition: {
      family: "six-nations",
      id: "competition-1",
      name: "Six Nations",
      nameJa: "シックスネーションズ",
      season: "2027",
      slug: "six-nations-2027",
    },
    homeScore: null,
    homeTeam: {
      flagCode: "🇯🇵",
      id: "japan-id",
      name: "日本",
      shortCode: "JPN",
      slug: "japan",
    },
    id: "match-1",
    kickoffAt: "2026-08-01T10:00:00.000Z",
    poolName: null,
    round: 1,
    roundName: "Round 1",
    status: "scheduled",
    venue: "国立競技場",
    ...overrides,
  };
}

describe("GET /api/v1/me/next-matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T03:00:00.000Z"));
    bearerMock.getUserFromBearer.mockResolvedValue(null);
    bearerMock.getSupabaseBearerClient.mockReturnValue(null);
    serverMock.getMobileUserProfile.mockResolvedValue({
      displayName: "Gota",
      favoriteTeamSlugs: ["japan"],
      premiumUntil: null,
    });
    matchesMock.getNextMatchesForTeams.mockResolvedValue([]);
    matchesMock.getSingleNationCompetitionIds.mockResolvedValue(new Set());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function requestNextMatches() {
    const { GET } = await import("@/app/api/v1/me/next-matches/route");

    return GET(
      new Request("http://localhost/api/v1/me/next-matches", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
  }

  it("returns 401 without a valid Bearer token", async () => {
    const response = await requestNextMatches();

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: null,
      error: "unauthorized",
      success: false,
    });
    expect(serverMock.getMobileUserProfile).not.toHaveBeenCalled();
  });

  it("returns the favorite team's next match in the V1NextReadMatch shape", async () => {
    const { client, inSlugs, select } = createClient([{ id: "japan-id" }]);
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    matchesMock.getNextMatchesForTeams.mockResolvedValue([
      { match: createMatch(), teamId: "japan-id" },
    ]);

    const response = await requestNextMatches();

    expect(select).toHaveBeenCalledWith("id");
    expect(inSlugs).toHaveBeenCalledWith("slug", ["japan"]);
    expect(matchesMock.getNextMatchesForTeams).toHaveBeenCalledWith({
      afterIso: "2026-07-29T03:00:00.000Z",
      teamIds: ["japan-id"],
    });
    expect(await response.json()).toEqual({
      data: {
        matches: [
          {
            away_team: {
              flag_code: "🇫🇷",
              id: "france-id",
              name: "フランス",
              score: null,
              short_code: "FRA",
              slug: "france",
            },
            competition_name: "シックスネーションズ",
            has_recap: false,
            home_team: {
              flag_code: "🇯🇵",
              id: "japan-id",
              name: "日本",
              score: null,
              short_code: "JPN",
              slug: "japan",
            },
            id: "match-1",
            kickoff_utc: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
      error: null,
      success: true,
    });
  });

  it("returns every distinct next match for multiple favorite teams", async () => {
    const { client } = createClient([{ id: "japan-id" }, { id: "france-id" }]);
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    matchesMock.getNextMatchesForTeams.mockResolvedValue([
      { match: createMatch({ id: "japan-next" }), teamId: "japan-id" },
      { match: createMatch({ id: "france-next" }), teamId: "france-id" },
    ]);

    const response = await requestNextMatches();
    const body = await response.json();

    expect(body.data.matches.map((match: { id: string }) => match.id)).toEqual([
      "japan-next",
      "france-next",
    ]);
  });

  it("deduplicates a match shared by two favorite teams", async () => {
    const { client } = createClient([{ id: "japan-id" }, { id: "france-id" }]);
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    const sharedMatch = createMatch();
    matchesMock.getNextMatchesForTeams.mockResolvedValue([
      { match: sharedMatch, teamId: "japan-id" },
      { match: sharedMatch, teamId: "france-id" },
    ]);

    const response = await requestNextMatches();
    const body = await response.json();

    expect(body.data.matches).toHaveLength(1);
    expect(body.data.matches[0].id).toBe("match-1");
  });

  it("returns an empty array without querying teams or matches when no favorites are set", async () => {
    const { client, from } = createClient();
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    serverMock.getMobileUserProfile.mockResolvedValue({
      displayName: "Gota",
      favoriteTeamSlugs: [],
      premiumUntil: null,
    });

    const response = await requestNextMatches();

    expect(await response.json()).toEqual({
      data: { matches: [] },
      error: null,
      success: true,
    });
    expect(from).not.toHaveBeenCalled();
    expect(matchesMock.getNextMatchesForTeams).not.toHaveBeenCalled();
  });

  it("suppresses flags for single-nation competitions", async () => {
    const { client } = createClient([{ id: "japan-id" }]);
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    matchesMock.getNextMatchesForTeams.mockResolvedValue([
      { match: createMatch(), teamId: "japan-id" },
    ]);
    matchesMock.getSingleNationCompetitionIds.mockResolvedValue(
      new Set(["competition-1"]),
    );

    const response = await requestNextMatches();
    const body = await response.json();

    expect(matchesMock.getSingleNationCompetitionIds).toHaveBeenCalledWith([
      "competition-1",
    ]);
    expect(body.data.matches[0]).toMatchObject({
      away_team: { flag_code: null },
      home_team: { flag_code: null },
    });
  });
});
