import { describe, expect, it } from "vitest";

import { deriveTeamStatsFromSourcedFacts } from "@/lib/llm/sourced-facts/derive-team-stats";

import type { SourcedFactInput } from "@/lib/llm/types";

function fact(value: string): SourcedFactInput {
  return {
    confidence: "high",
    fact: value,
    source_domain: "rugby-japan.jp",
    source_url: "https://rugby-japan.jp/example",
  };
}

describe("deriveTeamStatsFromSourcedFacts", () => {
  it("derives structured team stats from Japan vs Ireland sourced facts", () => {
    const result = deriveTeamStatsFromSourcedFacts(
      [
        fact("Possession: Japan 48% - Ireland 52%"),
        fact("Territory: Japan 45% - Ireland 55%"),
        fact("Tackle counts: Japan 120 - Ireland 110"),
        fact("Carries: Japan 95 - Ireland 105"),
        fact("Lineout success: Japan 85% - Ireland 90%"),
        fact("Scrum success: Japan 80% - Ireland 85%"),
        fact("Turnovers: Japan 12 - Ireland 10"),
        fact("Metres gained: Japan 350m - Ireland 400m"),
      ],
      ["Japan", "JPN"],
      ["Ireland", "IRE"],
    );

    expect(result.home).toEqual({
      carries: 95,
      lineout_success_pct: 85,
      metres_gained: 350,
      possession_pct: 48,
      scrum_success_pct: 80,
      tackles_made: 120,
      territory_pct: 45,
      turnovers: 12,
    });
    expect(result.away).toEqual({
      carries: 105,
      lineout_success_pct: 90,
      metres_gained: 400,
      possession_pct: 52,
      scrum_success_pct: 85,
      tackles_made: 110,
      territory_pct: 55,
      turnovers: 10,
    });
    expect(result.teamStats).toEqual({
      away: result.away,
      home: result.home,
    });
    expect(result.consumedFactIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("leaves facts unconsumed when the teams cannot be resolved", () => {
    const result = deriveTeamStatsFromSourcedFacts(
      [fact("Possession: France 48% - Ireland 52%")],
      ["Japan"],
      ["Ireland"],
    );

    expect(result.teamStats).toBeNull();
    expect(result.consumedFactIndexes).toEqual([]);
  });

  it("leaves unknown stat names unconsumed", () => {
    const result = deriveTeamStatsFromSourcedFacts(
      [fact("Rucks won: Japan 80 - Ireland 75")],
      ["Japan"],
      ["Ireland"],
    );

    expect(result.teamStats).toBeNull();
    expect(result.consumedFactIndexes).toEqual([]);
  });
});
