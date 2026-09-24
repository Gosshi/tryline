import { describe, expect, it } from "vitest";

import { computeTeamFormStats } from "@/lib/llm/stages/assemble";

function form(scores: Array<[number, number]>) {
  return scores.map(([home_score, away_score]) => ({
    home_team_name: "Team",
    away_team_name: "Opponent",
    home_score,
    away_score,
  }));
}

describe("computeTeamFormStats", () => {
  it("counts recent outcomes and the current streak in newest-first order", () => {
    expect(
      computeTeamFormStats(
        form([
          [20, 10],
          [10, 20],
          [30, 10],
          [10, 10],
          [20, 10],
        ]),
        "Team",
      ),
    ).toMatchObject({
      wins: 3,
      losses: 1,
      draws: 1,
      games_counted: 5,
      current_streak: { result: "win", count: 1 },
    });
  });

  it("counts consecutive draws as the current result streak", () => {
    expect(
      computeTeamFormStats(
        form([
          [10, 10],
          [15, 15],
          [20, 10],
        ]),
        "Team",
      ),
    ).toMatchObject({ current_streak: { result: "draw", count: 2 } });
  });

  it("reports the sample size and null streak when no matches qualify", () => {
    expect(
      computeTeamFormStats(
        form([
          [20, 10],
          [10, 20],
        ]),
        "Team",
      ),
    ).toMatchObject({ games_counted: 2 });
    expect(computeTeamFormStats([], "Team")).toMatchObject({
      games_counted: 0,
      current_streak: null,
    });
  });
});
