export type ScheduleCoverage = {
  ingestedRoundCount: number;
  totalRounds: number | null;
};

export function hasIncompleteSchedule({
  ingestedRoundCount,
  totalRounds,
}: ScheduleCoverage): boolean {
  return totalRounds !== null && ingestedRoundCount < totalRounds;
}
