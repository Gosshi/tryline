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
  highlightMatchId?: string | null;
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

function getDayLabelParts(dateLabel: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) \((.+)\)$/.exec(dateLabel);

  if (!match) {
    return {
      day: dateLabel,
      month: "JST",
      weekday: "",
    };
  }

  return {
    day: String(Number(match[3])),
    month: `${Number(match[2])}月`,
    weekday: match[4],
  };
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
  isHighlighted,
  match,
}: {
  compact: boolean;
  isHighlighted: boolean;
  match: CalendarMatch;
}) {
  const status = getStatusPresentation(match.status);
  const stateLabel = getMatchStateLabel(match);
  const contentBadge = match.hasRecap
    ? {
        className: "bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
        label: "レビュー",
      }
    : match.hasPreview
      ? { className: "bg-slate-100 text-slate-600", label: "プレビュー" }
      : null;
  const rowClassName = isHighlighted && !compact
    ? "group block rounded-lg border border-[var(--color-accent)]/35 bg-gradient-to-r from-[var(--color-accent)]/10 to-white px-4 py-3 shadow-sm transition-colors hover:border-[var(--color-accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    : "group block rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

  return (
    <Link
      className={rowClassName}
      href={`/matches/${match.id}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--color-ink-muted)]">
            {formatCompetitionTitle(
              match.competition,
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
              対
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
          {isHighlighted && (
            <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold text-white">
              注目
            </span>
          )}
          {contentBadge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${contentBadge.className}`}
            >
              {contentBadge.label}
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
  highlightMatchId = null,
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
      {groupMatchesByJstDay(matches).map((group) => {
        const dayParts = getDayLabelParts(group.dateLabel);

        return (
          <section
            className="flex items-stretch gap-3 sm:gap-4"
            key={group.key}
            aria-labelledby={`calendar-${group.key}`}
          >
            <div
              className={`flex shrink-0 flex-col items-center justify-center rounded-2xl bg-[var(--color-ink)] text-white shadow-sm ${
                compact ? "w-14 px-2 py-3" : "w-16 px-2 py-4"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                {dayParts.weekday}
              </span>
              <h3
                className={`font-number font-black leading-none ${
                  compact ? "mt-1 text-2xl" : "mt-1 text-3xl"
                }`}
                id={`calendar-${group.key}`}
              >
                {dayParts.day}
              </h3>
              <span className="mt-1 text-[10px] font-bold text-white/70">
                {dayParts.month}
              </span>
              <span className="mt-3 rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-bold text-white/75">
                {group.matches.length}試合
              </span>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {group.matches.map((match) => (
                <li key={match.id}>
                  <MatchRow
                    compact={compact}
                    isHighlighted={match.id === highlightMatchId}
                    match={match}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
