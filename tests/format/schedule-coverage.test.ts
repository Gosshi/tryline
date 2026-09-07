import { describe, expect, it } from "vitest";

import {
  hasIncompleteSchedule,
  hasMissingScheduleData,
} from "@/lib/format/schedule-coverage";

describe("hasIncompleteSchedule", () => {
  it("does not report fixture gaps while a Premiership-style round is missing", () => {
    expect(
      hasIncompleteSchedule({
        ingestedRegularSeasonFixtureCount: 85,
        ingestedRoundCount: 17,
        standingTeamCount: 10,
        totalRounds: 18,
      }),
    ).toEqual({ missingFixtures: null, missingRounds: 1 });
  });

  it("returns zero missing fixtures for a complete URC-style season", () => {
    expect(
      hasIncompleteSchedule({
        ingestedRegularSeasonFixtureCount: 144,
        ingestedRoundCount: 18,
        standingTeamCount: 16,
        totalRounds: 18,
      }),
    ).toEqual({ missingFixtures: 0, missingRounds: 0 });
  });

  it("would detect the missing Newcastle fixtures once total rounds are available", () => {
    expect(
      hasIncompleteSchedule({
        ingestedRegularSeasonFixtureCount: 72,
        ingestedRoundCount: 18,
        standingTeamCount: 10,
        totalRounds: 18,
      }),
    ).toEqual({ missingFixtures: 18, missingRounds: 0 });
  });

  it.each([
    {
      ingestedRegularSeasonFixtureCount: 0,
      ingestedRoundCount: 0,
      standingTeamCount: 10,
      totalRounds: null,
    },
    {
      ingestedRegularSeasonFixtureCount: 0,
      ingestedRoundCount: 0,
      standingTeamCount: 0,
      totalRounds: 18,
    },
    {
      ingestedRegularSeasonFixtureCount: 0,
      ingestedRoundCount: 0,
      standingTeamCount: 9,
      totalRounds: 18,
    },
    {
      ingestedRegularSeasonFixtureCount: 91,
      ingestedRoundCount: 18,
      standingTeamCount: 10,
      totalRounds: 18,
    },
    {
      ingestedRegularSeasonFixtureCount: 85,
      ingestedRoundCount: 17,
      standingTeamCount: 10,
      totalRounds: 18,
    },
  ])("returns null fixtures when its assumptions do not hold", (coverage) => {
    expect(hasIncompleteSchedule(coverage).missingFixtures).toBeNull();
  });

  it("keeps missing rounds separate from fixture coverage", () => {
    const coverage = hasIncompleteSchedule({
      ingestedRegularSeasonFixtureCount: 21,
      ingestedRoundCount: 3,
      standingTeamCount: 0,
      totalRounds: 26,
    });

    expect(coverage).toEqual({ missingFixtures: null, missingRounds: 23 });
    expect(hasMissingScheduleData(coverage)).toBe(true);
  });
});
