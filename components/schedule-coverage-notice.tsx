import { formatCompetitionTitle } from "@/lib/format/competition";

import type { IncompleteSchedule } from "@/lib/format/schedule-coverage";

type ScheduleCoverageNoticeCompetition = IncompleteSchedule & {
  family: string;
  ingestedRoundCount: number;
  name: string;
  nameJa?: string | null;
  season: string;
  slug: string;
  totalRounds: number | null;
};

type ScheduleCoverageNoticeProps = {
  competitions: ScheduleCoverageNoticeCompetition[];
};

function getScheduleCoverageMessage(
  competition: ScheduleCoverageNoticeCompetition,
): string | null {
  if (competition.totalRounds === null) {
    return null;
  }

  const title = formatCompetitionTitle(competition, competition.season);
  const hasMissingFixtures =
    competition.missingFixtures !== null && competition.missingFixtures > 0;

  if (competition.missingRounds > 0) {
    return `${title}: 全${competition.totalRounds}節中${competition.ingestedRoundCount}節を掲載しています。${hasMissingFixtures ? " 一部の試合が未取得です。" : ""}`;
  }

  if (hasMissingFixtures) {
    return `${title}: ${competition.totalRounds}節を掲載していますが、一部の試合が未取得です。`;
  }

  return null;
}

export function ScheduleCoverageNotice({
  competitions,
}: ScheduleCoverageNoticeProps) {
  const messages = competitions
    .map(getScheduleCoverageMessage)
    .filter((message): message is string => message !== null);

  if (messages.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="日程掲載状況"
      className="border-l-4 border-[var(--color-rule)] bg-white px-4 py-3"
    >
      <p className="text-xs font-bold tracking-[0.12em] text-[var(--color-ink-muted)]">
        日程掲載状況
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
        {messages.join("・")}
      </p>
    </aside>
  );
}
