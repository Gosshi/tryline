import { describe, expect, it } from "vitest";

import { getIsoWeek, groupMatchesByRound } from "@/lib/format/match-groups";

import type { MatchListItem } from "@/lib/db/queries/matches";

const baseMatch: MatchListItem = {
  awayScore: null,
  awayTeam: { name: "France", shortCode: "FRA", slug: "france" },
  homeScore: null,
  homeTeam: { name: "Ireland", shortCode: "IRL", slug: "ireland" },
  id: "match-1",
  kickoffAt: "2025-11-02T12:00:00.000Z",
  poolName: null,
  round: null,
  roundName: null,
  status: "scheduled",
  venue: null,
};

describe("match groups", () => {
  it("calculates ISO weeks from kickoff timestamps", () => {
    expect(getIsoWeek("2025-11-02T12:00:00.000Z")).toBe(44);
    expect(getIsoWeek("2025-11-08T12:00:00.000Z")).toBe(45);
  });

  it("groups roundless competitions by week index", () => {
    const grouped = groupMatchesByRound([
      baseMatch,
      {
        ...baseMatch,
        id: "match-2",
        kickoffAt: "2025-11-03T12:00:00.000Z",
      },
      {
        ...baseMatch,
        id: "match-3",
        kickoffAt: "2025-11-08T12:00:00.000Z",
      },
    ]);

    expect(
      grouped.map(([key, matches]) => [key, matches.map((match) => match.id)]),
    ).toEqual([
      [
        {
          endDate: "2025-11-02",
          startDate: "2025-11-02",
          type: "week",
          weekIndex: 1,
        },
        ["match-1"],
      ],
      [
        {
          endDate: "2025-11-08",
          startDate: "2025-11-03",
          type: "week",
          weekIndex: 2,
        },
        ["match-2", "match-3"],
      ],
    ]);
  });

  it("keeps round-based grouping when any round is present", () => {
    const grouped = groupMatchesByRound([
      { ...baseMatch, id: "match-1", round: 2 },
      { ...baseMatch, id: "match-2", round: null },
      { ...baseMatch, id: "match-3", round: 1 },
    ]);

    expect(grouped.map(([key]) => key)).toEqual([
      { round: 1, roundName: null, type: "round" },
      { round: 2, roundName: null, type: "round" },
      { round: null, roundName: null, type: "round" },
    ]);
  });

  it("groups null-round playoff matches by roundName", () => {
    const grouped = groupMatchesByRound([
      { ...baseMatch, id: "match-1", round: 18 },
      { ...baseMatch, id: "match-2", roundName: "quarterfinals" },
      { ...baseMatch, id: "match-3", roundName: "quarterfinals" },
      { ...baseMatch, id: "match-4", roundName: "semifinals" },
      { ...baseMatch, id: "match-5" },
    ]);

    expect(
      grouped.map(([key, matches]) => [key, matches.map((match) => match.id)]),
    ).toEqual([
      [{ round: 18, roundName: null, type: "round" }, ["match-1"]],
      [
        { round: null, roundName: "quarterfinals", type: "round" },
        ["match-2", "match-3"],
      ],
      [{ round: null, roundName: "semifinals", type: "round" }, ["match-4"]],
      [{ round: null, roundName: null, type: "round" }, ["match-5"]],
    ]);
  });
});
