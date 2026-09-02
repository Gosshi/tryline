import { describe, expect, it } from "vitest";

import { hasIncompleteSchedule } from "@/lib/format/schedule-coverage";

describe("hasIncompleteSchedule", () => {
  it.each([
    [{ ingestedRoundCount: 0, totalRounds: null }, false],
    [{ ingestedRoundCount: 2, totalRounds: 26 }, true],
    [{ ingestedRoundCount: 18, totalRounds: 18 }, false],
    [{ ingestedRoundCount: 17, totalRounds: 18 }, true],
  ])("returns %j for %j", (coverage, expected) => {
    expect(hasIncompleteSchedule(coverage)).toBe(expected);
  });
});
