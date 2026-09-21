import { describe, expect, it } from "vitest";

import {
  calculateRows,
  createEmptyStanding,
  ensureMatchEventsAvailable,
} from "@/scripts/calculate-standings";

function calculateMatch(params: {
  awayScore: number;
  awayTries: number;
  homeScore: number;
  homeTries: number;
  family: string;
}) {
  const standings = new Map([
    ["home", createEmptyStanding("home", "Home")],
    ["away", createEmptyStanding("away", "Away")],
  ]);
  const rows = calculateRows({
    competitionFamily: params.family,
    matches: [
      {
        away_score: params.awayScore,
        away_team_id: "away",
        home_score: params.homeScore,
        home_team_id: "home",
        id: "match-1",
      },
    ],
    standings,
    triesByMatchAndTeam: new Map([
      [
        "match-1",
        new Map([
          ["home", params.homeTries],
          ["away", params.awayTries],
        ]),
      ],
    ]),
  });

  return Object.fromEntries(rows.map((row) => [row.teamId, row]));
}

describe("calculate-standings", () => {
  it.each([
    ["Castres 29-27 Toulon", 29, 4, 27, 4, [1, 1], [0, 0]],
    ["Lyon 40-36 Clermont", 40, 4, 36, 5, [1, 1], [0, 0]],
    ["Vannes 23-29 Toulouse", 23, 2, 29, 4, [0, 1], [0, 0]],
    ["Pau 70-28 Bayonne", 70, 10, 28, 4, [1, 1], [1, 0]],
  ])(
    "uses the distinct Top 14 bonus rules for %s",
    (_name, homeScore, homeTries, awayScore, awayTries, standardBonus, top14Bonus) => {
      const standard = calculateMatch({
        awayScore,
        awayTries,
        family: "premiership",
        homeScore,
        homeTries,
      });
      const top14 = calculateMatch({
        awayScore,
        awayTries,
        family: "top-14",
        homeScore,
        homeTries,
      });

      expect([
        standard.home!.bonusPointsTry,
        standard.away!.bonusPointsTry,
      ]).toEqual(standardBonus);
      expect([top14.home!.bonusPointsTry, top14.away!.bonusPointsTry]).toEqual(
        top14Bonus,
      );
    },
  );

  it("keeps the non-Top 14 losing-bonus rule unchanged", () => {
    const standard = calculateMatch({
      awayScore: 25,
      awayTries: 3,
      family: "premiership",
      homeScore: 18,
      homeTries: 2,
    });
    const top14 = calculateMatch({
      awayScore: 25,
      awayTries: 3,
      family: "top-14",
      homeScore: 18,
      homeTries: 2,
    });

    expect(standard.home!.bonusPointsLosing).toBe(1);
    expect(top14.home!.bonusPointsLosing).toBe(0);
  });

  it("awards the LNR offensive bonus on a draw when a team has three more tries", () => {
    const top14 = calculateMatch({
      awayScore: 15,
      awayTries: 0,
      family: "top-14",
      homeScore: 15,
      homeTries: 3,
    });

    expect(top14.home!.bonusPointsTry).toBe(1);
    expect(top14.away!.bonusPointsTry).toBe(0);
  });

  it("rejects all calculation when a finished match has no events", () => {
    expect(() =>
      ensureMatchEventsAvailable(
        [
          {
            away_score: 12,
            away_team_id: "away",
            home_score: 18,
            home_team_id: "home",
            id: "missing-events",
          },
        ],
        new Set(),
      ),
    ).toThrow("finished_match_events_missing: missing-events");
  });
});
