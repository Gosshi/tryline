import Link from "next/link";

import { TeamBadge } from "@/components/team-badge";
import { formatCompetitionTitle } from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getStatusPresentation } from "@/lib/format/status";

import type { CalendarMatch } from "@/lib/db/queries/matches";

type WeekScheduleProps = {
  compact?: boolean;
  emptyMessage?: string;
  matches: CalendarMatch[];
};

type DayGroup = {
  dateLabel: string;
  key: string;
  matches: CalendarMatch[];
};

function groupMatchesByJstDay(matches: CalendarMatch[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const match of matches) {
    const dateLabel = formatKickoffJstDate(match.kickoffAt);
    const key = dateLabel.slice(0, 10);
    const group = groups.get(key) ?? {
      dateLabel,
      key,
      matches: [],
    };
    group.matches.push(match);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function getMatchStateLabel(match: CalendarMatch): string {
  if (
    match.status === "finished" &&
    match.homeScore !== null &&
    match.awayScore !== null
  ) {
    return `${match.homeScore}–${match.awayScore}`;
  }

  if (match.status === "in_progress") {
    return "ライブ";
  }

  if (match.status === "scheduled") {
    return formatKickoffJstTime(match.kickoffAt);
  }

  return getStatusPresentation(match.status).label;
}

function MatchRow({
  compact,
  match,
}: {
  compact: boolean;
  match: CalendarMatch;
}) {
  const status = getStatusPresentation(match.status);
  const stateLabel = getMatchStateLabel(match);

  return (
    <Link
      className="group block rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={`/matches/${match.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--color-ink-muted)]">
            {formatCompetitionTitle(
              match.competition.name,
              match.competition.season,
            )}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-[var(--color-ink)]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <TeamBadge
                shortCode={match.homeTeam.shortCode}
                size={compact ? 18 : 20}
                slug={match.homeTeam.slug}
              />
              <span className="truncate">{match.homeTeam.name}</span>
            </span>
            <span className="shrink-0 text-xs font-normal uppercase text-slate-400">
              vs
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <TeamBadge
                shortCode={match.awayTeam.shortCode}
                size={compact ? 18 : 20}
                slug={match.awayTeam.slug}
              />
              <span className="truncate">{match.awayTeam.name}</span>
            </span>
          </div>
          {!compact && match.venue && (
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              {match.venue}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:justify-end">
          {match.hasContent && (
            <span className="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
              解説
            </span>
          )}
          {match.status !== "scheduled" && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}
            >
              {status.label}
            </span>
          )}
          <span className="min-w-[72px] text-right text-sm font-bold tabular-nums text-[var(--color-ink)]">
            {stateLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function WeekSchedule({
  compact = false,
  emptyMessage = "今週の試合はありません。",
  matches,
}: WeekScheduleProps) {
  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-[var(--color-ink-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {groupMatchesByJstDay(matches).map((group) => (
        <section key={group.key} aria-labelledby={`calendar-${group.key}`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3
              className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]"
              id={`calendar-${group.key}`}
            >
              {group.dateLabel}
            </h3>
            <span className="text-xs text-slate-400">
              {group.matches.length}試合
            </span>
          </div>
          <ul className="space-y-2">
            {group.matches.map((match) => (
              <li key={match.id}>
                <MatchRow compact={compact} match={match} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
