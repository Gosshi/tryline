import { describe, expect, it, vi } from "vitest";

const matchMocks = vi.hoisted(() => ({
  getNextMatchForTeamSlug: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchMocks);

import { getFeaturedCompetition } from "@/lib/featured-competition";

describe("getFeaturedCompetition", () => {
  it("selects the competition containing Japan's next match", async () => {
    matchMocks.getNextMatchForTeamSlug.mockResolvedValue({
      awayScore: null,
      awayTeam: {
        name: "Australia",
        shortCode: "AUS",
        slug: "australia",
      },
      competition: {
        family: "lipovitan-challenge-cup",
        name: "Lipovitan Challenge Cup",
        nameJa: null,
        season: "2026",
        slug: "lipovitan-challenge-cup-2026",
      },
      homeScore: null,
      homeTeam: {
        name: "Japan",
        shortCode: "JPN",
        slug: "japan",
      },
      id: "japan-australia",
      kickoffAt: "2026-08-08T10:00:00.000Z",
      poolName: null,
      round: null,
      roundName: null,
      status: "scheduled",
      venue: null,
    });

    const now = new Date("2026-07-21T00:00:00.000Z");
    const competition = await getFeaturedCompetition(now);

    expect(matchMocks.getNextMatchForTeamSlug).toHaveBeenCalledWith(
      "japan",
      now.toISOString(),
    );
    expect(competition).toMatchObject({
      family: "lipovitan-challenge-cup",
      season: "2026",
    });
    expect(competition.headline).toContain("Lipovitan Challenge Cup");
    expect(competition.description).toContain("Japan 対 Australia");
  });

  it("falls back to Nations Championship when Japan has no future match", async () => {
    matchMocks.getNextMatchForTeamSlug.mockResolvedValue(null);

    await expect(
      getFeaturedCompetition(new Date("2026-07-21T00:00:00.000Z")),
    ).resolves.toEqual({
      description:
        "7月・11月の代表戦を、日程・順位・結果・日本語レビューまでひとつのページで。",
      family: "nations-championship",
      headline: "ネーションズチャンピオンシップ 2026 を追う",
      season: "2026",
    });
  });
});
