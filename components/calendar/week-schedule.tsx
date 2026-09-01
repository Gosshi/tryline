import Link from "next/link";

import { SpoilerScore } from "@/components/spoiler-score";
import { TeamBadge } from "@/components/team-badge";
import { TrackedLink } from "@/components/tracked-link";
import {
  formatFamilyName,
  formatCompetitionTitle,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getStatusPresentation } from "@/lib/format/status";

import type { CalendarMatch } from "@/lib/db/queries/matches";

type WeekScheduleProps = {
  emptyMessage?: string;
  highlightMatchId?: string | null;
  matches: CalendarMatch[];
  spoilerGuardEnabled?: boolean;
};

export type CalendarDayGroup = {
  dateLabel: string;
  key: string;
  matches: CalendarMatch[];
};

export type CalendarTimeGroup = {
  kickoffTime: string;
  matches: CalendarMatch[];
};

const BOARD_COMPETITION_LABELS: Record<string, string> = {
  "autumn-nations": "Autumn Nations",
  "greatest-rivalry": "Greatest Rivalry",
  "league-one": "リーグワン",
  "lipovitan-challenge-cup": "リポビタンD",
  "nations-championship": "Nations",
  pnc: "PNC",
  premiership: "Premiership",
  "puma-trophy": "Puma Trophy",
  "rugby-championship": "Rugby Championship",
  rwc: "RWC",
  "six-nations": "Six Nations",
  "super-rugby-pacific": "Super Rugby",
  "top-14": "Top 14",
  urc: "URC",
};

export function groupMatchesByJstDay(
  matches: CalendarMatch[],
): CalendarDayGroup[] {
  const groups = new Map<string, CalendarDayGroup>();

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

export function groupMatchesByJstTime(
  matches: CalendarMatch[],
): CalendarTimeGroup[] {
  const groups = new Map<string, CalendarTimeGroup>();

  for (const match of matches) {
    const kickoffTime = formatKickoffJstTime(match.kickoffAt).replace(
      /\s*JST$/,
      "",
    );
    const group = groups.get(kickoffTime) ?? {
      kickoffTime,
      matches: [],
    };
    group.matches.push(match);
    groups.set(kickoffTime, group);
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

function getContentBadge(match: CalendarMatch) {
  return match.hasRecap
    ? {
        className: "bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
        label: "レビュー",
        shortLabel: "R",
      }
    : match.hasPreview
      ? {
          className: "bg-slate-100 text-slate-600",
          label: "プレビュー",
          shortLabel: "P",
        }
      : null;
}

function MobileMatchRow({
  isHighlighted,
  match,
  spoilerGuardEnabled,
}: {
  isHighlighted: boolean;
  match: CalendarMatch;
  spoilerGuardEnabled: boolean;
}) {
  const status = getStatusPresentation(match.status);
  const stateLabel = getMatchStateLabel(match);
  const contentBadge = getContentBadge(match);
  const rowClassName = isHighlighted
    ? "group rounded-lg border border-[var(--color-accent)]/35 bg-gradient-to-r from-[var(--color-accent)]/10 to-white px-4 py-3 shadow-sm transition-colors hover:border-[var(--color-accent)]/60"
    : "group rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50";

  return (
    <div className={rowClassName}>
      <TrackedLink
        analytics={{
          cta_id: "calendar_match_competition",
          cta_location: "calendar_match_card",
          destination: "competition_hub",
          label: formatCompetitionTitle(
            match.competition,
            match.competition.season,
          ),
        }}
        className="inline-flex text-xs font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        href={`/c/${match.competition.family}/${match.competition.season}`}
      >
        {formatCompetitionTitle(match.competition, match.competition.season)}
        <span aria-hidden className="ml-1">
          →
        </span>
      </TrackedLink>
      <Link
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        href={`/matches/${match.id}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-[var(--color-ink)]">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <TeamBadge
                  shortCode={match.homeTeam.shortCode}
                  size={20}
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
                  size={20}
                  slug={match.awayTeam.slug}
                />
                <span className="truncate">{match.awayTeam.name}</span>
              </span>
            </div>
            {match.venue && (
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
              {match.status === "finished" ? (
                <SpoilerScore enabled={spoilerGuardEnabled}>
                  {stateLabel}
                </SpoilerScore>
              ) : (
                stateLabel
              )}
            </span>
          </div>
        </div>
      </Link>
      {match.hasBroadcasts && (
        <Link
          className="border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 hover:border-[var(--color-accent)]/45 hover:bg-[var(--color-accent)]/15 mt-3 inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-bold text-[var(--color-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href={`/matches/${match.id}#broadcasts`}
        >
          視聴
          <span aria-hidden className="ml-1">
            →
          </span>
        </Link>
      )}
    </div>
  );
}

function BoardMatch({
  isHighlighted,
  match,
  spoilerGuardEnabled,
}: {
  isHighlighted: boolean;
  match: CalendarMatch;
  spoilerGuardEnabled: boolean;
}) {
  const status = getStatusPresentation(match.status);
  const contentBadge = getContentBadge(match);
  const stateLabel = getMatchStateLabel(match);

  return (
    <article
      className={`border-l-[3px] bg-white px-3 py-3 ${
        isHighlighted
          ? "bg-[var(--color-accent)]/10"
          : "border-y border-y-slate-200"
      }`}
      data-testid="calendar-board-match"
      style={{
        borderLeftColor: getCompetitionFamilyColor(match.competition.family),
      }}
    >
      <Link
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        href={`/matches/${match.id}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-number text-sm font-black tabular-nums text-[var(--color-ink)]">
            {match.homeTeam.shortCode}
            <span className="px-1 font-normal text-slate-400">–</span>
            {match.awayTeam.shortCode}
          </p>
          {isHighlighted && (
            <span className="shrink-0 text-[10px] font-bold text-[var(--color-accent)]">
              注目
            </span>
          )}
        </div>
        <p className="full-name mt-1 text-xs leading-5 text-[var(--color-ink-muted)]">
          {match.homeTeam.name} 対 {match.awayTeam.name}
        </p>
        {(match.status !== "scheduled" || contentBadge) && (
          <div className="mt-2 flex min-h-4 items-center gap-1.5">
            {contentBadge && (
              <span
                aria-label={contentBadge.label}
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black ${contentBadge.className}`}
                title={contentBadge.label}
              >
                {contentBadge.shortLabel}
              </span>
            )}
            {match.status !== "scheduled" && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${status.className}`}
              >
                {status.label}
              </span>
            )}
            {match.status === "finished" && (
              <span className="ml-auto text-xs font-black tabular-nums text-[var(--color-ink)]">
                <SpoilerScore enabled={spoilerGuardEnabled}>
                  {stateLabel}
                </SpoilerScore>
              </span>
            )}
          </div>
        )}
      </Link>
      {match.hasBroadcasts && (
        <Link
          className="mt-2 inline-flex text-xs font-bold text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href={`/matches/${match.id}#broadcasts`}
        >
          視聴
        </Link>
      )}
    </article>
  );
}

function WeekBoard({
  groups,
  highlightMatchId,
  spoilerGuardEnabled,
}: {
  groups: CalendarDayGroup[];
  highlightMatchId: string | null;
  spoilerGuardEnabled: boolean;
}) {
  const isSingleDay = groups.length === 1;
  const competitions = Array.from(
    new Map(
      groups
        .flatMap((group) => group.matches)
        .map((match) => [match.competition.family, match.competition]),
    ).values(),
  );
  const singleDayMatchCount = groups[0]?.matches.length ?? 0;
  const singleDayMaxWidth = `min(100%, calc(${singleDayMatchCount} * 288px + ${Math.max(singleDayMatchCount - 1, 0)} * 20px))`;

  return (
    <section
      className="hidden lg:block"
      data-testid="calendar-week-board"
      aria-label="週ボード"
    >
      <p className="mb-3 text-xs font-medium text-[var(--color-ink-muted)]">
        時刻はすべて日本時間（JST）
      </p>
      <div
        className={
          isSingleDay
            ? "flex"
            : "grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
        }
        data-testid="calendar-week-board-grid"
      >
        {groups.map((group, index) => {
          const dayParts = getDayLabelParts(group.dateLabel);
          const timeGroups = groupMatchesByJstTime(group.matches);

          return (
            <section
              className="min-w-0"
              data-testid="calendar-board-day"
              key={group.key}
              style={
                isSingleDay
                  ? { maxWidth: singleDayMaxWidth, width: "100%" }
                  : undefined
              }
            >
              <header className="mb-3 flex items-end gap-2 border-b border-slate-200 pb-2 text-[var(--color-ink)]">
                <span className="font-number text-3xl font-black tabular-nums leading-none">
                  {dayParts.day}
                </span>
                <span className="text-sm font-bold">{dayParts.weekday}</span>
                {index === 0 && (
                  <span className="pb-0.5 text-xs text-[var(--color-ink-muted)]">
                    {dayParts.month}
                  </span>
                )}
              </header>
              <div className="space-y-3">
                {timeGroups.map((timeGroup) => (
                  <section key={timeGroup.kickoffTime}>
                    <h3 className="mb-1.5 font-number text-xs font-black tabular-nums text-[var(--color-ink-muted)]">
                      {timeGroup.kickoffTime}
                    </h3>
                    <div
                      className={
                        isSingleDay
                          ? "grid gap-x-5 gap-y-0 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]"
                          : "space-y-0"
                      }
                      data-testid="calendar-board-match-grid"
                    >
                      {timeGroup.matches.map((match) => (
                        <BoardMatch
                          isHighlighted={match.id === highlightMatchId}
                          key={match.id}
                          match={match}
                          spoilerGuardEnabled={spoilerGuardEnabled}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <ul
        aria-label="大会凡例"
        className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-ink-muted)]"
      >
        {competitions.map((competition) => (
          <li
            className="inline-flex items-center gap-1.5"
            key={competition.family}
          >
            <span
              aria-hidden
              className="h-2 w-2"
              style={{
                backgroundColor: getCompetitionFamilyColor(competition.family),
              }}
            />
            {BOARD_COMPETITION_LABELS[competition.family] ??
              formatFamilyName(competition.family)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WeekSchedule({
  emptyMessage = "今週の試合はありません。",
  highlightMatchId = null,
  matches,
  spoilerGuardEnabled = false,
}: WeekScheduleProps) {
  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-sm text-[var(--color-ink-muted)]">
        {emptyMessage}
      </div>
    );
  }

  const groups = groupMatchesByJstDay(matches);

  return (
    <>
      <WeekBoard
        groups={groups}
        highlightMatchId={highlightMatchId}
        spoilerGuardEnabled={spoilerGuardEnabled}
      />
      <div className="space-y-6 lg:hidden">
        {groups.map((group) => {
          const dayParts = getDayLabelParts(group.dateLabel);

          return (
            <section
              className="flex items-stretch gap-3 sm:gap-4"
              key={group.key}
              aria-labelledby={`calendar-${group.key}`}
            >
              <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-[var(--color-ink)] px-2 py-4 text-white shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                  {dayParts.weekday}
                </span>
                <h3
                  className="mt-1 font-number text-3xl font-black leading-none"
                  id={`calendar-${group.key}`}
                >
                  {dayParts.day}
                </h3>
                <span className="mt-1 text-[10px] font-bold text-white/70">
                  {dayParts.month}
                </span>
                <span className="bg-white/12 mt-3 rounded-full px-2 py-0.5 text-[10px] font-bold text-white/75">
                  {group.matches.length}試合
                </span>
              </div>
              <ul className="min-w-0 flex-1 space-y-2">
                {group.matches.map((match) => (
                  <li key={match.id}>
                    <MobileMatchRow
                      isHighlighted={match.id === highlightMatchId}
                      match={match}
                      spoilerGuardEnabled={spoilerGuardEnabled}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
