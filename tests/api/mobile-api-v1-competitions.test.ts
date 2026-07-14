import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
}));

const standingsMock = vi.hoisted(() => ({
  getPoolStandingsForCompetition: vi.fn(),
  getStandingsForCompetition: vi.fn(),
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/standings", () => standingsMock);

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

const standing = {
  bonusPointsLosing: 0,
  bonusPointsTry: 1,
  drawn: 0,
  lost: 0,
  played: 1,
  pointsAgainst: 10,
  pointsFor: 24,
  position: 1,
  teamName: "日本",
  teamShortCode: "JPN",
  totalPoints: 5,
  triesFor: 3,
  won: 1,
};

describe("GET /api/v1/competitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionsMock.listFamilies.mockResolvedValue(["six-nations"]);
    competitionsMock.listSeasonsByFamily.mockResolvedValue([competition]);
  });

  it("returns flattened competition seasons in the shared envelope", async () => {
    const { GET } = await import("@/app/api/v1/competitions/route");
    const response = await GET();

    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(competitionsMock.listSeasonsByFamily).toHaveBeenCalledWith(
      "six-nations",
    );
    expect(await response.json()).toEqual({
      data: {
        competitions: [
          {
            end_date: "2027-03-20",
            family: "six-nations",
            match_count: 15,
            name: "シックスネーションズ",
            season: "2027",
            slug: "six-nations-2027",
            start_date: "2027-02-05",
          },
        ],
      },
      error: null,
      success: true,
    });
  });
});

describe("GET /api/v1/competitions/[slug]/standings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionsMock.getCompetitionBySlug.mockResolvedValue(competition);
    standingsMock.getStandingsForCompetition.mockResolvedValue([standing]);
    standingsMock.getPoolStandingsForCompetition.mockResolvedValue([]);
  });

  async function requestStandings(slug = "six-nations-2027") {
    const { GET } =
      await import("@/app/api/v1/competitions/[slug]/standings/route");

    return GET(
      new Request(`http://localhost/api/v1/competitions/${slug}/standings`),
      { params: Promise.resolve({ slug }) },
    );
  }

  it("returns regular standings with public cache headers", async () => {
    const response = await requestStandings();
    const body = await response.json();

    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(body).toMatchObject({
      data: {
        competition: {
          name: "シックスネーションズ",
          slug: "six-nations-2027",
        },
        pools: [],
        standings: [
          {
            position: 1,
            team_name: "日本",
            team_short_code: "JPN",
            total_points: 5,
          },
        ],
      },
      error: null,
      success: true,
    });
  });

  it("returns pool standings instead of the flat table for pool competitions", async () => {
    standingsMock.getPoolStandingsForCompetition.mockResolvedValue([
      { poolName: "Pool A", standings: [standing] },
    ]);

    const response = await requestStandings("rwc-2027");
    const body = await response.json();

    expect(body.data.standings).toEqual([]);
    expect(body.data.pools).toEqual([
      {
        pool_name: "Pool A",
        standings: [
          expect.objectContaining({ position: 1, team_name: "日本" }),
        ],
      },
    ]);
  });

  it("matches the Web behavior with 200 and empty arrays when no standings exist", async () => {
    standingsMock.getStandingsForCompetition.mockResolvedValue([]);

    const response = await requestStandings();

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      pools: [],
      standings: [],
    });
  });

  it("returns an enveloped 404 for an unknown competition", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue(null);

    const response = await requestStandings("missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      data: null,
      error: "competition not found",
      success: false,
    });
    expect(standingsMock.getStandingsForCompetition).not.toHaveBeenCalled();
  });
});
