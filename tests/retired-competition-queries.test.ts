import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  queries: [] as {
    table: string;
    select: string;
    limit: number;
    exclusions: { column: string; operator: string; value: string }[];
  }[],
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: (table: string) => {
      const state = {
        table,
        select: "",
        limit: Infinity,
        exclusions: [] as { column: string; operator: string; value: string }[],
      };
      fixture.queries.push(state);
      const query = {
        select: (columns: string) => {
          state.select = columns;
          return query;
        },
        eq: () => query,
        in: () => query,
        not: (column: string, operator: string, value: string) => {
          state.exclusions.push({ column, operator, value });
          return query;
        },
        gte: () => query,
        lt: () => query,
        order: () => query,
        limit: (n: number) => {
          state.limit = n;
          return query;
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve(
            resolve({
              data: (fixture.rows[table] ?? [])
                .filter((row) =>
                  state.exclusions.every(({ column, value }) => {
                    const innerJoins =
                      column === "match.competition.family"
                        ? /match:matches![^()]*!inner\s*\(/.test(
                            state.select,
                          ) &&
                          /competition:competitions![^()]*!inner\s*\(/.test(
                            state.select,
                          )
                        : /competition:competitions![^()]*!inner\s*\(/.test(
                            state.select,
                          );
                    if (!innerJoins) return true;
                    let field: unknown = row;
                    for (const part of column.split("."))
                      field = (field as Record<string, unknown> | null)?.[part];
                    return !value
                      .slice(1, -1)
                      .split(",")
                      .includes(String(field));
                  }),
                )
                .slice(0, state.limit),
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
  fixture.queries = [];
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

it("bounds the payload with DB-side retirement filters and inner joins", async () => {
  await getUpcomingMatches(5);
  await getNextUpcomingMatch();
  await getRecentlyReviewedFamilies(5);
  await getRecentlyReviewedCompetitionGroups();
  expect(fixture.queries.map((q) => q.limit)).toEqual([5, 1, 50, 40]);
  for (const query of fixture.queries) {
    expect(query.exclusions).toEqual([
      {
        column:
          query.table === "matches"
            ? "competition.family"
            : "match.competition.family",
        operator: "in",
        value: "(top-14)",
      },
    ]);
    expect(query.select).toMatch(/competition:competitions![^()]*!inner\s*\(/);
    if (query.table === "match_content")
      expect(query.select).toMatch(/match:matches![^()]*!inner\s*\(/);
  }
});
