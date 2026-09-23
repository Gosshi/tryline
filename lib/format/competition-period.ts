export type CompetitionPeriod = {
  startDate: string;
  endDate: string;
};

const KNOWN_COMPETITION_PERIODS: Record<string, CompetitionPeriod> = {
  "nations-championship-2026": {
    endDate: "2026-11-29",
    startDate: "2026-07-04",
  },
  "rwc-2027": {
    endDate: "2027-11-13",
    startDate: "2027-10-01",
  },
};

export function getKnownCompetitionPeriod(
  competitionSlug: string,
): CompetitionPeriod | null {
  return KNOWN_COMPETITION_PERIODS[competitionSlug] ?? null;
}
