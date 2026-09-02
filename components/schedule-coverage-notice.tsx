import { formatCompetitionTitle } from "@/lib/format/competition";

type ScheduleCoverageNoticeCompetition = {
  family: string;
  name: string;
  nameJa?: string | null;
  season: string;
  slug: string;
};

type ScheduleCoverageNoticeProps = {
  competitions: ScheduleCoverageNoticeCompetition[];
};

export function ScheduleCoverageNotice({
  competitions,
}: ScheduleCoverageNoticeProps) {
  if (competitions.length === 0) {
    return null;
  }

  const titles = competitions.map((competition) =>
    formatCompetitionTitle(competition, competition.season),
  );

  return (
    <aside
      aria-label="日程掲載状況"
      className="border-l-4 border-[var(--color-rule)] bg-white px-4 py-3"
    >
      <p className="text-xs font-bold tracking-[0.12em] text-[var(--color-ink-muted)]">
        日程掲載状況
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
        {titles.join("・")}の日程には、現在表示できない節があります。
      </p>
    </aside>
  );
}
