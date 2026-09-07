export type ScheduleCoverage = {
  ingestedRegularSeasonFixtureCount: number;
  ingestedRoundCount: number;
  standingTeamCount: number;
  totalRounds: number | null;
};

export type IncompleteSchedule = {
  missingFixtures: number | null;
  missingRounds: number;
};

export function hasIncompleteSchedule({
  ingestedRegularSeasonFixtureCount,
  ingestedRoundCount,
  standingTeamCount,
  totalRounds,
}: ScheduleCoverage): IncompleteSchedule {
  const missingRounds =
    totalRounds === null ? 0 : Math.max(0, totalRounds - ingestedRoundCount);

  if (
    totalRounds === null ||
    missingRounds > 0 ||
    standingTeamCount === 0 ||
    standingTeamCount % 2 !== 0
  ) {
    return { missingFixtures: null, missingRounds };
  }

  const expectedFixtureCount = (standingTeamCount / 2) * totalRounds;

  if (expectedFixtureCount < ingestedRegularSeasonFixtureCount) {
    return { missingFixtures: null, missingRounds };
  }

  return {
    missingFixtures: expectedFixtureCount - ingestedRegularSeasonFixtureCount,
    missingRounds,
  };
}

export function hasMissingScheduleData({
  missingFixtures,
  missingRounds,
}: IncompleteSchedule): boolean {
  return missingRounds > 0 || (missingFixtures !== null && missingFixtures > 0);
}
