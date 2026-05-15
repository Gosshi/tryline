import { describe, expect, it } from "vitest";

import {
  selectLatestSeasonWithMatches,
  type CompetitionRow,
} from "@/lib/db/queries/competitions";

function buildSeason(
  season: string,
  matchCount: number,
): CompetitionRow {
  return {
    endDate: null,
    family: "autumn-nations",
    id: season,
    matchCount,
    name: `Autumn Nations Series ${season}`,
    season,
    slug: `autumn-nations-${season}`,
    startDate: null,
  };
}

describe("selectLatestSeasonWithMatches", () => {
  it("prefers the latest season that has matches", () => {
    const result = selectLatestSeasonWithMatches([
      buildSeason("2026", 0),
      buildSeason("2025", 21),
      buildSeason("2024", 20),
    ]);

    expect(result?.season).toBe("2025");
  });

  it("falls back to the latest season when no seasons have matches", () => {
    const result = selectLatestSeasonWithMatches([
      buildSeason("2026", 0),
      buildSeason("2025", 0),
    ]);

    expect(result?.season).toBe("2026");
  });
});
