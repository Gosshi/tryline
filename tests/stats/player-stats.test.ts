import { describe, expect, it } from "vitest";

import {
  buildPlayerStatsFromEvents,
  findActualPlayerStats,
  normalizePlayerNameForStatMatch,
  playerNamesLikelyMatch,
} from "@/lib/stats/player-stats";

describe("player-stats", () => {
  it("normalizes player names and matches surname-style claims", () => {
    expect(normalizePlayerNameForStatMatch("Takuro Matsunaga")).toBe(
      "takuromatsunaga",
    );
    expect(playerNamesLikelyMatch("Matsunaga", "Takuro Matsunaga")).toBe(true);
    expect(playerNamesLikelyMatch("Other", "Takuro Matsunaga")).toBe(false);
  });

  it("builds scoring stats from match events", () => {
    const statsByPlayer = buildPlayerStatsFromEvents([
      { player_name: "Takuro Matsunaga", type: "try" },
      { player_name: "Takuro Matsunaga", type: "conversion" },
      { player_name: "Takuro Matsunaga", type: "penalty_goal" },
      { player_name: "Other Player", type: "try" },
    ]);

    expect(findActualPlayerStats("Matsunaga", statsByPlayer)).toEqual({
      conversions: 1,
      penaltyGoals: 1,
      totalPoints: 10,
      tries: 1,
    });
  });
});
