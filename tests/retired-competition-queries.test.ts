import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: (table: string) => {
      let limit = Infinity;
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        not: () => query,
        gte: () => query,
        lt: () => query,
        order: () => query,
        limit: (n: number) => {
          limit = n;
          return query;
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve(
            resolve({
              data: (fixture.rows[table] ?? []).slice(0, limit),
              error: null,
            }),
          ),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/db/queries/match-broadcasts", () => ({
  getMatchBroadcastPresenceForMatches: async () => new Set(),
}));
vi.mock("@/lib/db/queries/standings", () => ({
  getStandingPositionLookupForCompetitions: async () => new Map(),
}));
import {
  listCompetitionScheduleCoverage,
  listFamilies,
} from "@/lib/db/queries/competitions";
import {
  getMatchesInRange,
  getUpcomingMatches,
  getNextUpcomingMatch,
  getRecentlyReviewedFamilies,
  getRecentlyReviewedCompetitionGroups,
} from "@/lib/db/queries/matches";

function row(id: string, family: string) {
  return {
    id,
    kickoff_at: "2026-11-15T00:00:00Z",
    kickoff_time_tbd: false,
    updated_at: "2026-11-14T00:00:00Z",
    status: "scheduled",
    home_score: null,
    away_score: null,
    venue: "Stadium",
    external_ids: { wikipedia_round: 1 },
    home_team: {
      id: "home",
      slug: "home",
      name: "Home",
      short_code: "HOM",
      world_ranking: null,
    },
    away_team: {
      id: "away",
      slug: "away",
      name: "Away",
      short_code: "AWY",
      world_ranking: null,
    },
    competition: {
      id: family,
      family,
      slug: `${family}-2026-27`,
      name: family,
      name_ja: null,
      season: "2026-27",
    },
  };
}
const matches = [
  ...Array.from({ length: 6 }, (_, i) => row(`top-${i}`, "top-14")),
  row("urc-1", "urc"),
  row("urc-2", "urc"),
];
beforeEach(() => {
  fixture.rows = {
    matches,
    match_content: matches.map((match) => ({
      match,
      generated_at: "2026-11-14T00:00:00Z",
      content_md: "Review",
    })),
    competitions: ["top-14", "urc"].map((family) => ({
      family,
      slug: `${family}-2026-27`,
      name: family,
      name_ja: null,
      season: "2026-27",
      total_rounds: 18,
      matches: [],
      competition_standings: [],
    })),
  };
});
describe("retired competitions in public queries", () => {
  it("getMatchesInRange excludes retired matches even for historical weeks", async () => {
    expect(
      (await getMatchesInRange("2025-01-01", "2025-01-08")).map((m) => m.id),
    ).toEqual(["urc-1", "urc-2"]);
  });
  it("getUpcomingMatches filters before limit 5 despite six earlier retired matches", async () => {
    expect((await getUpcomingMatches(5)).map((m) => m.id)).toEqual([
      "urc-1",
      "urc-2",
    ]);
  });
  it("getNextUpcomingMatch finds an active match beyond the retired candidates", async () => {
    expect((await getNextUpcomingMatch())?.id).toBe("urc-1");
  });
  it("getRecentlyReviewedFamilies excludes retired families before its result limit", async () => {
    expect((await getRecentlyReviewedFamilies(5)).map((m) => m.family)).toEqual(
      ["urc"],
    );
  });
  it("getRecentlyReviewedCompetitionGroups excludes retired groups", async () => {
    const groups = await getRecentlyReviewedCompetitionGroups();
    expect(groups.map((g) => g.competition.family)).toEqual(["urc"]);
    expect([
      groups[0]?.hero.id,
      ...groups[0]!.compact.map((m) => m.id),
    ]).toEqual(["urc-1", "urc-2"]);
  });
  it("listCompetitionScheduleCoverage excludes retired families", async () => {
    expect(
      (await listCompetitionScheduleCoverage()).map((c) => c.family),
    ).toEqual(["urc"]);
  });
  it("listFamilies preserves the retired family for existing pages and APIs", async () => {
    expect(await listFamilies()).toEqual(["top-14", "urc"]);
  });
});
