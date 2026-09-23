import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

import {
  listHeadToHeadPairs,
  mapHeadToHeadRowsToPairs,
  normalizeHeadToHeadSlug,
  parseHeadToHeadSlug,
} from "@/lib/db/queries/matches";

const leinster = {
  id: "team-1",
  name: "Leinster",
  short_code: "LEI",
  slug: "leinster",
};
const toulouse = {
  id: "team-2",
  name: "Stade Toulousain",
  short_code: "TLS",
  slug: "toulouse",
};
const bath = {
  id: "team-3",
  name: "Bath",
  short_code: "BAT",
  slug: "bath",
};

describe("head-to-head match queries", () => {
  beforeEach(() => {
    clientMock.from.mockReset();
  });

  it("normalizes pair slugs alphabetically", () => {
    expect(normalizeHeadToHeadSlug("toulouse", "leinster")).toBe(
      "leinster-vs-toulouse",
    );
    expect(parseHeadToHeadSlug("leinster-vs-toulouse")).toEqual({
      teamSlugA: "leinster",
      teamSlugB: "toulouse",
    });
    expect(parseHeadToHeadSlug("leinster")).toBeNull();
    expect(parseHeadToHeadSlug("leinster-vs-leinster")).toBeNull();
  });

  it("groups real match rows into canonical H2H pairs", () => {
    expect(
      mapHeadToHeadRowsToPairs([
        {
          away_team: toulouse,
          home_team: leinster,
          kickoff_at: "2025-05-01T12:00:00.000Z",
        },
        {
          away_team: leinster,
          home_team: toulouse,
          kickoff_at: "2026-05-01T12:00:00.000Z",
        },
        {
          away_team: bath,
          home_team: leinster,
          kickoff_at: "2026-01-01T12:00:00.000Z",
        },
        {
          away_team: null,
          home_team: leinster,
          kickoff_at: "2026-02-01T12:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        matchCount: 2,
        slug: "leinster-vs-toulouse",
        teamA: {
          name: "レンスター",
          nameJa: null,
          shortCode: "LEI",
          slug: "leinster",
        },
        teamB: {
          name: "トゥールーズ",
          nameJa: null,
          shortCode: "TLS",
          slug: "toulouse",
        },
        updatedAt: "2026-05-01T12:00:00.000Z",
      },
      {
        matchCount: 1,
        slug: "bath-vs-leinster",
        teamA: {
          name: "バース",
          nameJa: null,
          shortCode: "BAT",
          slug: "bath",
        },
        teamB: {
          name: "レンスター",
          nameJa: null,
          shortCode: "LEI",
          slug: "leinster",
        },
        updatedAt: "2026-01-01T12:00:00.000Z",
      },
    ]);
  });

  it("prioritizes pairs with scheduled matches in the next 60 days", () => {
    const referenceDate = new Date("2026-09-23T00:00:00.000Z");
    const rows = Array.from({ length: 250 }, (_, index) => {
      const matchCount = index < 50 ? 3 : 2;
      const homeTeam = {
        ...leinster,
        id: `club-home-${index}`,
        slug: `club-home-${index}`,
      };
      const awayTeam = {
        ...toulouse,
        id: `club-away-${index}`,
        slug: `club-away-${index}`,
      };

      return Array.from({ length: matchCount }, (_, matchIndex) => ({
        away_team: awayTeam,
        home_team: homeTeam,
        kickoff_at: `2026-11-${String(matchIndex + 1).padStart(2, "0")}T12:00:00.000Z`,
        status: "finished",
      }));
    }).flat();
    const upcomingPairs = [
      { away: "fiji", date: "2026-09-30", home: "japan" },
      { away: "wales", date: "2026-10-10", home: "japan" },
      { away: "japan", date: "2026-10-24", home: "england" },
    ];

    for (const pair of upcomingPairs) {
      const homeTeam = { ...bath, id: pair.home, slug: pair.home };
      const awayTeam = { ...leinster, id: pair.away, slug: pair.away };
      rows.push(
        {
          away_team: awayTeam,
          home_team: homeTeam,
          kickoff_at: "2025-11-01T12:00:00.000Z",
          status: "finished",
        },
        {
          away_team: awayTeam,
          home_team: homeTeam,
          kickoff_at: `${pair.date}T12:00:00.000Z`,
          status: "scheduled",
        },
      );
    }

    const result = mapHeadToHeadRowsToPairs(rows, 200, referenceDate);

    expect(result.slice(0, 3).map(({ slug }) => slug)).toEqual([
      "fiji-vs-japan",
      "japan-vs-wales",
      "england-vs-japan",
    ]);
    expect(result).toHaveLength(200);
  });

  it("loads all 1,407 stored matches in stable 1,000-row pages", async () => {
    const allRows = Array.from({ length: 1407 }, (_, index) => ({
      away_team: toulouse,
      home_team: leinster,
      kickoff_at: new Date(Date.UTC(2020, 0, 1 + index)).toISOString(),
      status: "finished",
    }));
    const range = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
    );
    const order = vi.fn(() => query);
    const query = {
      order,
      range,
      select: vi.fn(() => query),
    };
    clientMock.from.mockReturnValue({ select: query.select });

    const result = await listHeadToHeadPairs();

    expect(result).toHaveLength(1);
    expect(result[0]?.matchCount).toBe(1407);
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(order.mock.calls).toEqual([
      ["kickoff_at", { ascending: false }],
      ["id"],
      ["kickoff_at", { ascending: false }],
      ["id"],
    ]);
  });

  it("lists H2H pairs from stored matches", async () => {
    const query = {
      order: vi.fn(() => query),
      range: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              away_team: toulouse,
              home_team: leinster,
              kickoff_at: "2025-05-01T12:00:00.000Z",
            },
          ],
          error: null,
        }),
      ),
      select: vi.fn(() => query),
    };
    clientMock.from.mockReturnValue({ select: query.select });

    await expect(listHeadToHeadPairs()).resolves.toMatchObject([
      { slug: "leinster-vs-toulouse" },
    ]);
  });
});
