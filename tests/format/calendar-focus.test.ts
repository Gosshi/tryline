import { describe, expect, it } from "vitest";

import { selectCalendarFocusMatchId } from "@/lib/format/calendar-focus";

import type { CalendarMatch } from "@/lib/db/queries/matches";

function createMatch(overrides: Partial<CalendarMatch>): CalendarMatch {
  return {
    awayScore: null,
    awayTeam: {
      id: "away-id",
      name: "Away",
      shortCode: "AWY",
      slug: "away",
      worldRanking: null,
    },
    competition: {
      family: "six-nations",
      id: "competition-id",
      name: "Six Nations",
      season: "2026",
      slug: "six-nations-2026",
    },
    hasPreview: false,
    hasRecap: false,
    homeScore: null,
    homeTeam: {
      id: "home-id",
      name: "Home",
      shortCode: "HOM",
      slug: "home",
      worldRanking: null,
    },
    id: "match",
    kickoffAt: "2026-07-06T10:00:00.000Z",
    poolName: null,
    round: null,
    roundName: null,
    status: "scheduled",
    venue: null,
    ...overrides,
  };
}

describe("selectCalendarFocusMatchId", () => {
  it("prioritizes the earliest Japan match", () => {
    expect(
      selectCalendarFocusMatchId(
        [
          createMatch({
            homeTeam: { name: "Japan", shortCode: "JPN", slug: "japan" },
            id: "japan-match",
          }),
          createMatch({
            awayTeam: { name: "Ireland", shortCode: "IRE", slug: "ireland" },
            id: "ranking-match",
          }),
        ],
        new Map(),
      ),
    ).toBe("japan-match");
  });

  it("uses world ranking score when there is no Japan match", () => {
    expect(
      selectCalendarFocusMatchId(
        [
          createMatch({
            awayTeam: {
              name: "Low",
              shortCode: "LOW",
              slug: "low",
              worldRanking: 18,
            },
            homeTeam: {
              name: "Mid",
              shortCode: "MID",
              slug: "mid",
              worldRanking: 12,
            },
            id: "lower-level",
          }),
          createMatch({
            awayTeam: {
              name: "Ireland",
              shortCode: "IRE",
              slug: "ireland",
              worldRanking: 2,
            },
            homeTeam: {
              name: "France",
              shortCode: "FRA",
              slug: "france",
              worldRanking: 4,
            },
            id: "highest-level",
          }),
        ],
        new Map(),
      ),
    ).toBe("highest-level");
  });

  it("falls back to standings positions and hides highlight without signals", () => {
    const standings = new Map([
      ["competition-id", new Map([["home-id", 1], ["away-id", 2]])],
    ]);

    expect(selectCalendarFocusMatchId([createMatch({ id: "standings" })], standings)).toBe(
      "standings",
    );
    expect(selectCalendarFocusMatchId([createMatch({})], new Map())).toBeNull();
  });
});
