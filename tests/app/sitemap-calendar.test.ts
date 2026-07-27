import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries/competitions", () => ({
  listFamilies: vi.fn().mockResolvedValue([]),
  listSeasonsByFamily: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/matches", () => ({
  listHeadToHeadPairs: vi.fn().mockResolvedValue([]),
  listMatchIdsWithContent: vi.fn().mockResolvedValue([]),
  listRoundHubParams: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/players", () => ({
  listIndexablePlayerSlugs: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/teams", () => ({
  listAllTeams: vi.fn().mockResolvedValue([]),
}));

describe("sitemap static routes", () => {
  it("includes /calendar and /news", async () => {
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
          priority: 0.6,
          url: "https://www.trylinerugby.com/news",
        }),
      ]),
    );
  });
});
