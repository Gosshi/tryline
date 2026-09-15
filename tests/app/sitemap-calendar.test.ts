import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries/competitions", () => ({
  listFamilies: vi.fn().mockResolvedValue([]),
  listSeasonsByFamily: vi.fn().mockResolvedValue([]),
}));
const matchesMock = vi.hoisted(() => ({
  listHeadToHeadPairs: vi.fn().mockResolvedValue([]),
  listMatchIdsWithContent: vi.fn().mockResolvedValue([]),
  listPrerenderMatchIds: vi.fn().mockResolvedValue([]),
  listRoundHubParams: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/players", () => ({
  listIndexablePlayerSlugs: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/standings", () => ({
  listStandingsPageParams: vi.fn().mockResolvedValue([
    {
      competition: "six-nations",
      season: "2026",
      updatedAt: "2026-02-10T03:04:00.000Z",
    },
  ]),
}));
vi.mock("@/lib/db/queries/teams", () => ({
  listAllTeams: vi.fn().mockResolvedValue([]),
}));

describe("sitemap static routes", () => {
  it("keeps old published match URLs in the sitemap", async () => {
    matchesMock.listMatchIdsWithContent.mockResolvedValueOnce([
      {
        competitionFamily: "six-nations",
        id: "published-100-days-ago",
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);

    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.trylinerugby.com/matches/published-100-days-ago",
        }),
      ]),
    );
    expect(matchesMock.listPrerenderMatchIds).not.toHaveBeenCalled();
  });

  it("includes /calendar and standings pages while excluding /news", async () => {
    const { default: sitemap } = await import("@/app/sitemap");

    const entries = await sitemap();

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeFrequency: "daily",
          priority: 0.8,
          url: "https://www.trylinerugby.com/calendar",
        }),
        expect.objectContaining({
          changeFrequency: "daily",
          priority: 0.75,
          url: "https://www.trylinerugby.com/c/six-nations/2026/standings",
        }),
        expect.objectContaining({
          url: "https://www.trylinerugby.com/c/rwc/2027/bracket",
        }),
      ]),
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://www.trylinerugby.com/news" }),
      ]),
    );
    expect(
      entries.filter(
        ({ url }) =>
          url === "https://www.trylinerugby.com/c/rwc/2027/bracket",
      ),
    ).toHaveLength(1);
  });
});
