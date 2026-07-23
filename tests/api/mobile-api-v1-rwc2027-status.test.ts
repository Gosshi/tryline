import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionStartDateByFamilyAndSeason: vi.fn(),
}));

const teamsMock = vi.hoisted(() => ({
  getTeamWorldRankingBySlug: vi.fn(),
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/teams", () => teamsMock);

describe("GET /api/v1/rwc2027-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionsMock.getCompetitionStartDateByFamilyAndSeason.mockResolvedValue(
      "2027-09-10",
    );
    teamsMock.getTeamWorldRankingBySlug.mockResolvedValue({
      worldRanking: 13,
      worldRankingUpdatedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("returns the RWC2027 kickoff date and Japan's latest ranking", async () => {
    const { GET } = await import("@/app/api/v1/rwc2027-status/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    expect(await response.json()).toEqual({
      data: {
        japan_ranking: 13,
        japan_ranking_updated_at: "2026-07-20T00:00:00.000Z",
        kickoff_date: "2027-09-10",
      },
      error: null,
      success: true,
    });
    expect(
      competitionsMock.getCompetitionStartDateByFamilyAndSeason,
    ).toHaveBeenCalledWith("rwc", "2027");
    expect(teamsMock.getTeamWorldRankingBySlug).toHaveBeenCalledWith("japan");
  });

  it("returns null values when the RWC2027 competition or Japan ranking is absent", async () => {
    competitionsMock.getCompetitionStartDateByFamilyAndSeason.mockResolvedValue(
      null,
    );
    teamsMock.getTeamWorldRankingBySlug.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/rwc2027-status/route");
    const response = await GET();

    expect((await response.json()).data).toEqual({
      japan_ranking: null,
      japan_ranking_updated_at: null,
      kickoff_date: null,
    });
  });
});
