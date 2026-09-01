import { formatCompetitionTitle } from "@/lib/format/competition";

import type { CompetitionScheduleCoverage } from "@/lib/format/schedule-coverage";

export function ScheduleCoverageNotice({
  competitions,
}: {
  competitions: CompetitionScheduleCoverage[];
}) {
  if (competitions.length === 0) {
    return null;
  }

  const names = competitions.map((competition) =>
    formatCompetitionTitle(competition, competition.season),
  );

  return (
    <aside
      aria-label="日程掲載状況"
      className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3"
    >
      <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
        日程掲載状況
      </p>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        {names.join("・")}の日程は開催が近づいてから掲載されます。
      </p>
    </aside>
  );
}
