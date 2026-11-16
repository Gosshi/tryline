import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({ from: vi.fn() }));
const competitionMocks = vi.hoisted(() => ({
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
}));
const matchMocks = vi.hoisted(() => ({
  listHeadToHeadPairs: vi.fn(),
  listRoundHubParams: vi.fn(),
}));
const playerMocks = vi.hoisted(() => ({ listIndexablePlayerSlugs: vi.fn() }));
const standingsMocks = vi.hoisted(() => ({ listStandingsPageParams: vi.fn() }));
const teamMocks = vi.hoisted(() => ({ listAllTeams: vi.fn() }));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => queryMocks,
}));
vi.mock("@/lib/db/queries/competitions", async (original) => ({
  ...(await original<typeof import("@/lib/db/queries/competitions")>()),
  ...competitionMocks,
}));
vi.mock("@/lib/db/queries/matches", async (original) => ({
  ...(await original<typeof import("@/lib/db/queries/matches")>()),
  ...matchMocks,
}));
vi.mock("@/lib/db/queries/players", () => playerMocks);
vi.mock("@/lib/db/queries/standings", () => standingsMocks);
vi.mock("@/lib/db/queries/teams", () => teamMocks);

import sitemap from "@/app/sitemap";
import { listCompetitionLastModified } from "@/lib/db/queries/competitions";
import { listMatchIdsWithContent } from "@/lib/db/queries/matches";
import { SITE_URL } from "@/lib/site";

import type { MetadataRoute } from "next";

type Row = { id: string; [key: string]: unknown };
type Result = { data: Row[] | null; error: Error | null };
type Query = {
  table: string;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
};
let matches: Row[];
let content: Row[];
const queries: Query[] = [];
const errors = new Map<string, Error>();
const matchDate = "2026-05-08T10:00:00.000Z";
const articleDate = "2026-05-09T10:00:00.000Z";
const recentDate = "2026-05-10T10:00:00.000Z";

function match(id: string, competitionId: string, updatedAt = matchDate): Row {
  return { id, competition_id: competitionId, updated_at: updatedAt };
}
function article(
  id: string,
  matchId: string,
  generatedAt = articleDate,
  status = "published",
): Row {
  return {
    id,
    match_id: matchId,
    generated_at: generatedAt,
    status,
    match: { competition: { family: "urc", slug: "urc-2025-26" } },
  };
}
function entry(entries: MetadataRoute.Sitemap, path: string) {
  const found = entries.find((row) => row.url === `${SITE_URL}${path}`);
  expect(found).toBeDefined();
  return found!;
}

beforeEach(() => {
  vi.resetAllMocks();
  queries.length = 0;
  errors.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
  matches = [
    match("match-2025", "season-2025"),
    match("match-2026", "season-2026", recentDate),
  ];
  content = [
    article("article-2025", "match-2025"),
    article("article-2026", "match-2026"),
  ];
  competitionMocks.listFamilies.mockResolvedValue(["urc", "empty-cup"]);
  competitionMocks.listSeasonsByFamily.mockImplementation(
    async (family: string) =>
      family === "urc"
        ? [
            { id: "season-2026", season: "2026" },
            { id: "season-2025", season: "2025" },
            { id: "empty-season", season: "2024" },
          ]
        : [{ id: "empty-cup-2026", season: "2026" }],
  );
  matchMocks.listHeadToHeadPairs.mockResolvedValue([
    { slug: "japan-vs-scotland", updatedAt: "2026-05-11T01:00:00.000Z" },
  ]);
  matchMocks.listRoundHubParams.mockResolvedValue([
    {
      competition: "urc",
      season: "2026",
      round: 1,
      updatedAt: "2026-05-12T01:00:00.000Z",
    },
  ]);
  standingsMocks.listStandingsPageParams.mockResolvedValue([
    {
      competition: "urc",
      season: "2026",
      updatedAt: "2026-05-13T01:00:00.000Z",
    },
  ]);
  playerMocks.listIndexablePlayerSlugs.mockResolvedValue(["player-a"]);
  teamMocks.listAllTeams.mockResolvedValue([{ slug: "japan" }]);
  queryMocks.from.mockImplementation((table: string) => {
    if (table !== "matches" && table !== "match_content")
      throw new Error(`Unexpected table: ${table}`);
    const filters: [string, unknown][] = [];
    const ordering: [string, boolean][] = [];
    function result(from: number, to: number): Result {
      const error = errors.get(`${table}:${from}`) ?? null;
      if (error) return { data: null, error };
      const rows = (table === "matches" ? matches : content)
        .filter((row) => filters.every(([key, value]) => row[key] === value))
        .sort((a, b) => {
          for (const [key, ascending] of ordering) {
            const comparison = String(a[key]).localeCompare(String(b[key]));
            if (comparison) return ascending ? comparison : -comparison;
          }
          return 0;
        });
      return { data: rows.slice(from, to + 1), error: null };
    }
    const query = {
      table,
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      // Emulate the PostgREST default cap when the caller omits .range().
      then: (
        resolve: (value: Result) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(result(0, 999)).then(resolve, reject),
    };
    query.select.mockReturnValue(query);
    query.eq.mockImplementation((key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    });
    query.order.mockImplementation(
      (key: string, options?: { ascending: boolean }) => {
        ordering.push([key, options?.ascending ?? true]);
        return query;
      },
    );
    query.range.mockImplementation(async (from: number, to: number) =>
      result(from, to),
    );
    queries.push(query);
    return query;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sitemap lastmod accuracy", () => {
  it("uses the newer published article date for its season, and the newer match date in the other season", async () => {
    const entries = await sitemap();
    expect(entry(entries, "/c/urc/2025").lastModified).toEqual(
      new Date(articleDate),
    );
    expect(entry(entries, "/c/urc/2026").lastModified).toEqual(
      new Date(recentDate),
    );
  });
  it("omits the lastModified property itself for seasons and families with no matches", async () => {
    const entries = await sitemap();
    for (const path of ["/c/urc/2024", "/c/empty-cup/2026", "/c/empty-cup"])
      expect(Object.hasOwn(entry(entries, path), "lastModified")).toBe(false);
  });
  it("uses the maximum season timestamp for the family landing page", async () => {
    const entries = await sitemap();
    expect(entry(entries, "/c/urc").lastModified).toEqual(new Date(recentDate));
  });
  it("omits lastModified from team, player, home, calendar, pricing and bracket entries", async () => {
    const entries = await sitemap();
    for (const path of [
      "/teams/japan",
      "/players/player-a",
      "",
      "/calendar",
      "/pricing",
      "/c/rwc/2027/bracket",
    ])
      expect(Object.hasOwn(entry(entries, path), "lastModified")).toBe(false);
  });
  it("does not advertise the frozen current date as any page's last modification", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    for (const row of entries) {
      const modified = row.lastModified;
      const value =
        modified instanceof Date ? modified.toISOString() : modified;
      expect(value?.startsWith("2030-01-01")).not.toBe(true);
    }
  });
  it("keeps URL membership, priorities, frequencies and existing match/round/standings/H2H dates", async () => {
    content.push({
      ...article("article-en", "league-one-match"),
      match: {
        competition: { family: "league-one", slug: "league-one-2026-27" },
      },
    });
    const entries = await sitemap();
    const expected: [string, string, number][] = [
      ["", "daily", 1],
      ["/c/urc", "weekly", 0.6],
      ["/c/empty-cup", "weekly", 0.6],
      ...["2026", "2025", "2024"].map(
        (season) =>
          [`/c/urc/${season}`, "daily", 0.8] as [string, string, number],
      ),
      ["/c/empty-cup/2026", "daily", 0.8],
      ["/c/urc/2026/round/1", "weekly", 0.65],
      ["/c/urc/2026/standings", "daily", 0.75],
      ["/h2h/japan-vs-scotland", "monthly", 0.5],
      ["/matches/match-2025", "weekly", 0.7],
      ["/matches/match-2026", "weekly", 0.7],
      ["/matches/league-one-match", "weekly", 0.7],
      ["/matches/league-one-match/en", "weekly", 0.7],
      ["/teams/japan", "weekly", 0.7],
      ["/players/player-a", "weekly", 0.6],
      ["/c/rwc/2027/bracket", "daily", 0.8],
      ["/calendar", "daily", 0.8],
      ["/pricing", "monthly", 0.5],
    ];
    expect(entries.map(({ url }) => url).sort()).toEqual(
      expected.map(([path]) => `${SITE_URL}${path}`).sort(),
    );
    for (const [path, changeFrequency, priority] of expected)
      expect(entry(entries, path)).toMatchObject({ changeFrequency, priority });
    expect(entry(entries, "/matches/match-2025").lastModified).toEqual(
      new Date(articleDate),
    );
    expect(entry(entries, "/matches/league-one-match/en").lastModified).toEqual(
      new Date(articleDate),
    );
    expect(entry(entries, "/c/urc/2026/round/1").lastModified).toEqual(
      new Date("2026-05-12T01:00:00.000Z"),
    );
    expect(entry(entries, "/c/urc/2026/standings").lastModified).toEqual(
      new Date("2026-05-13T01:00:00.000Z"),
    );
    expect(entry(entries, "/h2h/japan-vs-scotland").lastModified).toEqual(
      new Date("2026-05-11T01:00:00.000Z"),
    );
  });
});

describe("sitemap query pagination", () => {
  it("reads all 2100 published content rows in three ranges and deduplicates using the newest article", async () => {
    content = Array.from({ length: 2100 }, (_, index) =>
      article(
        `article-${String(index).padStart(4, "0")}`,
        `match-${index % 2000}`,
        new Date(Date.parse(articleDate) - index * 1000).toISOString(),
      ),
    );
    content.push(
      article("draft", "draft-only", "2029-01-01T00:00:00.000Z", "draft"),
    );
    const result = await listMatchIdsWithContent();
    expect(result).toHaveLength(2000);
    expect(result[0]).toEqual({
      id: "match-0",
      competitionFamily: "urc",
      updatedAt: articleDate,
    });
    expect(result.at(-1)?.id).toBe("match-1999");
    expect(result.some(({ id }) => id === "match-1500")).toBe(true);
    expect(result.some(({ id }) => id === "draft-only")).toBe(false);
    expect(queries).toHaveLength(3);
    expect(queries.flatMap((query) => query.range.mock.calls)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    for (const query of queries) {
      expect(query.table).toBe("match_content");
      expect(query.eq).toHaveBeenCalledWith("status", "published");
      expect(query.order.mock.calls).toEqual([
        ["generated_at", { ascending: false }],
        ["id"],
      ]);
    }
  });
  it("reads all matches and published content pages, without fetching article bodies", async () => {
    matches = Array.from({ length: 2100 }, (_, index) =>
      match(
        `match-${String(index).padStart(4, "0")}`,
        index < 2000 ? "older-season" : "last-match-page-season",
      ),
    );
    content = Array.from({ length: 2100 }, (_, index) =>
      article(
        `article-${String(index).padStart(4, "0")}`,
        index === 2099 ? "match-2099" : "match-0000",
        index === 2099 ? articleDate : recentDate,
      ),
    );
    content.push(
      article("draft", "match-2099", "2029-01-01T00:00:00.000Z", "draft"),
    );
    const result = await listCompetitionLastModified();
    expect(result).toEqual(
      new Map([
        ["older-season", recentDate],
        ["last-match-page-season", articleDate],
      ]),
    );
    for (const table of ["matches", "match_content"]) {
      const calls = queries.filter((query) => query.table === table);
      expect(calls.flatMap((query) => query.range.mock.calls)).toEqual([
        [0, 999],
        [1000, 1999],
        [2000, 2999],
      ]);
      for (const query of calls) {
        expect(query.select).toHaveBeenCalledWith(
          table === "matches"
            ? "id, competition_id, updated_at"
            : "id, match_id, generated_at",
        );
        expect(query.order.mock.calls).toEqual([
          [
            table === "matches" ? "updated_at" : "generated_at",
            { ascending: false },
          ],
          ["id"],
        ]);
        if (table === "match_content")
          expect(query.eq).toHaveBeenCalledWith("status", "published");
      }
    }
  });
  it("returns an empty map for zero matches, including invisible or unrelated article rows", async () => {
    matches = [];
    expect(await listCompetitionLastModified()).toEqual(new Map());
  });
  it("compares timestamps as instants, including ISO offsets", async () => {
    matches = [
      match("offset-match", "offset-season", "2026-05-10T00:00:00+09:00"),
    ];
    content = [
      article("offset-article", "offset-match", "2026-05-09T16:00:00.000Z"),
    ];
    expect((await listCompetitionLastModified()).get("offset-season")).toBe(
      "2026-05-09T16:00:00.000Z",
    );
  });
  it.each(["matches", "match_content"])(
    "throws errors from later %s pages without returning partial results",
    async (table) => {
      const error = new Error(`Failed ${table} page`);
      errors.set(`${table}:1000`, error);
      matches = Array.from({ length: 1001 }, (_, index) =>
        match(`match-${index}`, "season"),
      );
      content = Array.from({ length: 1001 }, (_, index) =>
        article(`article-${index}`, `match-${index}`),
      );
      await expect(listCompetitionLastModified()).rejects.toBe(error);
    },
  );
  it("does not silently return the first content page when a later sitemap content page fails", async () => {
    const error = new Error("Failed sitemap second page");
    errors.set("match_content:1000", error);
    content = Array.from({ length: 1001 }, (_, index) =>
      article(`article-${index}`, `match-${index}`),
    );
    await expect(listMatchIdsWithContent()).rejects.toBe(error);
  });
});
