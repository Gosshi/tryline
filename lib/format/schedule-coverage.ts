export type CompetitionScheduleCoverage = {
  endDate: string | null;
  family: string;
  latestKickoffAt: string | null;
  name: string;
  nameJa?: string | null;
  season: string;
  slug: string;
};

function isBeforeEndDate(
  latestKickoffAt: string | null,
  endDate: string | null,
): boolean {
  return Boolean(
    latestKickoffAt && endDate && latestKickoffAt.slice(0, 10) < endDate,
  );
}

export function hasIncompleteCompetitionSchedule(
  coverage: Pick<CompetitionScheduleCoverage, "endDate" | "latestKickoffAt">,
): boolean {
  return isBeforeEndDate(coverage.latestKickoffAt, coverage.endDate);
}

export function findIncompleteCompetitionSchedulesForWeek(
  coverages: CompetitionScheduleCoverage[],
  weekStartUtcIso: string,
): CompetitionScheduleCoverage[] {
  return coverages.filter(
    (coverage) =>
      hasIncompleteCompetitionSchedule(coverage) &&
      coverage.latestKickoffAt !== null &&
      coverage.latestKickoffAt < weekStartUtcIso,
  );
}
