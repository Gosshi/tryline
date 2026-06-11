import { describe, expect, it } from "vitest";

import { computeDerivedMatchStats } from "@/lib/llm/stages/derived-stats";

import type { AssembledContentInput } from "@/lib/llm/types";

const lineups: AssembledContentInput["projected_lineups"] = {
  away: [
    {
      is_starter: true,
      jersey_number: 11,
      name: "Away Wing",
      position: "WTB",
    },
  ],
  home: [
    {
      is_starter: true,
      jersey_number: 14,
      name: "Home Wing",
      position: "WTB",
    },
  ],
};

function event(
  overrides: Partial<AssembledContentInput["match_events"][number]>,
): AssembledContentInput["match_events"][number] {
  return {
    minute: 1,
    player_name: "Player",
    team_name: "Home",
    type: "try",
    ...overrides,
  };
}

describe("computeDerivedMatchStats", () => {
  it("returns null for empty events", () => {
    expect(computeDerivedMatchStats([], lineups, "Home", "Away")).toBeNull();
  });

  it("detects scoring runs of at least 10 points", () => {
    const result = computeDerivedMatchStats(
      [
        event({ minute: 10, player_name: "Home Wing", type: "try" }),
        event({ minute: 11, type: "conversion" }),
        event({ minute: 15, player_name: "Home Wing", type: "try" }),
        event({ minute: 16, type: "conversion" }),
        event({ minute: 20, type: "penalty_goal" }),
      ],
      lineups,
      "Home",
      "Away",
    );

    expect(result?.scoring_runs).toEqual([
      {
        end_minute: 20,
        points: 17,
        start_minute: 10,
        team: "home",
      },
    ]);
  });

  it("computes comeback deficit overcome for the winning team", () => {
    const result = computeDerivedMatchStats(
      [
        event({
          minute: 5,
          player_name: "Away Wing",
          team_name: "Away",
          type: "try",
        }),
        event({ minute: 6, team_name: "Away", type: "conversion" }),
        event({
          minute: 20,
          player_name: "Away Wing",
          team_name: "Away",
          type: "try",
        }),
        event({ minute: 42, player_name: "Home Wing", type: "try" }),
        event({ minute: 43, type: "conversion" }),
        event({ minute: 50, player_name: "Home Wing", type: "try" }),
        event({ minute: 51, type: "conversion" }),
        event({ minute: 60, type: "penalty_goal" }),
        event({ minute: 70, type: "penalty_goal" }),
      ],
      lineups,
      "Home",
      "Away",
    );

    expect(result?.comeback).toEqual({
      deficit_overcome: 12,
      team: "home",
    });
    expect(result?.second_half).toEqual({
      away_points: 0,
      home_points: 20,
    });
  });

  it("sums opponent points during yellow-card sin-bin windows", () => {
    const result = computeDerivedMatchStats(
      [
        event({
          minute: 50,
          player_name: "Home Flanker",
          type: "yellow_card",
        }),
        event({
          minute: 55,
          player_name: "Away Wing",
          team_name: "Away",
          type: "try",
        }),
        event({ minute: 56, team_name: "Away", type: "conversion" }),
        event({ minute: 58, team_name: "Away", type: "penalty_goal" }),
      ],
      lineups,
      "Home",
      "Away",
    );

    expect(result?.cards).toEqual([
      {
        minute: 50,
        opponent_points_during: 10,
        player: "Home Flanker",
        team: "home",
        type: "yellow_card",
      },
    ]);
  });

  it("excludes penalty tries from conversion attempts", () => {
    const result = computeDerivedMatchStats(
      [
        event({
          is_penalty_try: true,
          minute: 5,
          player_name: "Penalty Try",
          type: "try",
        }),
        event({ minute: 20, player_name: "Home Wing", type: "try" }),
        event({ minute: 21, type: "conversion" }),
        event({ minute: 30, player_name: "Home Wing", type: "try" }),
        event({ minute: 31, type: "conversion" }),
      ],
      lineups,
      "Home",
      "Away",
    );

    expect(result?.conversions.home).toEqual({
      attempts: 2,
      made: 2,
    });
  });

  it("excludes null-minute scores from time-dependent scoring runs", () => {
    const result = computeDerivedMatchStats(
      [
        event({ minute: null, player_name: "Home Wing", type: "try" }),
        event({ minute: 10, player_name: "Home Wing", type: "try" }),
      ],
      lineups,
      "Home",
      "Away",
    );

    expect(result?.scoring_runs).toEqual([]);
    expect(result?.points_breakdown.home.tries).toBe(10);
  });

  it("skips events whose team does not match either side", () => {
    const result = computeDerivedMatchStats(
      [
        event({ minute: 10, team_name: "Neutral", type: "try" }),
        event({ minute: 12, player_name: "Home Wing", type: "try" }),
      ],
      lineups,
      "Home",
      "Away",
    );

    expect(result?.points_breakdown.home.tries).toBe(5);
    expect(result?.try_scorers).toEqual([
      {
        is_starter: true,
        jersey_number: 14,
        minute: 12,
        player: "Home Wing",
        position: "WTB",
        team: "home",
      },
    ]);
  });
});
