import Link from "next/link";

import { TeamBadge } from "@/components/team-badge";
import { formatCompetitionTitle } from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getTeamColor } from "@/lib/format/team-identity";

import type { CalendarMatch, UpcomingMatch } from "@/lib/db/queries/matches";
import type { StandingPositionLookup } from "@/lib/db/queries/standings";
import type { ReactNode } from "react";

type HomeMatchdayBoardProps = {
  focusMatchId: string | null;
  matches: CalendarMatch[];
  nextUpcomingMatch: UpcomingMatch | null;
  standingPositions: StandingPositionLookup;
  weekLabel: string;
};

type BoardMetric = {
  label: string;
  value: ReactNode;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function getJstStartOfDay(date: Date): number {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

  return Date.UTC(
    jstDate.getUTCFullYear(),
    jstDate.getUTCMonth(),
    jstDate.getUTCDate(),
  );
}

export function getNextMatchCountdownLabel(
  kickoffAt: string,
  now = new Date(),
): string {
  const daysUntilKickoff = Math.ceil(
    (getJstStartOfDay(new Date(kickoffAt)) - getJstStartOfDay(now)) / DAY_MS,
  );

  if (daysUntilKickoff <= 0) {
    return "次の試合は今日";
  }

  if (daysUntilKickoff === 1) {
    return "次の試合は明日";
  }

  return `次の試合まであと${daysUntilKickoff}日`;
}

function getContentLabel(match: CalendarMatch): string {
  if (match.hasRecap) {
    return "レビュー公開";
  }

  if (match.hasPreview) {
    return "プレビュー公開";
  }

  return "試合前";
}

function getLevelMetric(
  match: CalendarMatch,
  standingPositions: StandingPositionLookup,
): string | null {
  const competitionId = match.competition.id;
  const homeTeamId = match.homeTeam.id;
  const awayTeamId = match.awayTeam.id;

  if (competitionId && homeTeamId && awayTeamId) {
    const positions = standingPositions.get(competitionId);
    const homePosition = positions?.get(homeTeamId) ?? null;
    const awayPosition = positions?.get(awayTeamId) ?? null;

    if (homePosition !== null && awayPosition !== null) {
      return `${match.homeTeam.shortCode} ${homePosition}位 / ${match.awayTeam.shortCode} ${awayPosition}位`;
    }
  }

  const homeRanking = match.homeTeam.worldRanking ?? null;
  const awayRanking = match.awayTeam.worldRanking ?? null;

  if (homeRanking !== null && awayRanking !== null) {
    return `${match.homeTeam.shortCode} 世界${homeRanking}位 / ${match.awayTeam.shortCode} 世界${awayRanking}位`;
  }

  return null;
}

function MatchMiniRow({ match }: { match: CalendarMatch }) {
  return (
    <Link
      className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      href={`/matches/${match.id}`}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-bold tabular-nums text-white/55">
          {formatKickoffJstTime(match.kickoffAt)}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs font-bold text-white">
          <span className="truncate">{match.homeTeam.shortCode}</span>
          <span className="shrink-0 text-white/35">対</span>
          <span className="truncate">{match.awayTeam.shortCode}</span>
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
        {getContentLabel(match)}
      </span>
    </Link>
  );
}

export function HomeMatchdayBoard({
  focusMatchId,
  matches,
  nextUpcomingMatch,
  standingPositions,
  weekLabel,
}: HomeMatchdayBoardProps) {
  if (matches.length === 0) {
    if (!nextUpcomingMatch) {
      return null;
    }

    const competitionTitle = formatCompetitionTitle(
      nextUpcomingMatch.competition,
      nextUpcomingMatch.competition.season,
    );

    return (
      <aside
        aria-label="次の試合"
        className="border-white/12 rounded-[22px] border bg-white/[0.08] p-4 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Next Kickoff
          </p>
          <p className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/70">
            {getNextMatchCountdownLabel(nextUpcomingMatch.kickoffAt)}
          </p>
        </div>

        <div
          className="mt-4 overflow-hidden rounded-2xl p-4 text-white shadow-lg shadow-black/20"
          style={{
            background: `linear-gradient(160deg, rgb(12 16 28 / 42%), rgb(12 16 28 / 20%)), linear-gradient(135deg, ${getTeamColor(nextUpcomingMatch.homeTeam.slug)}33, ${getTeamColor(nextUpcomingMatch.awayTeam.slug)}33)`,
          }}
        >
          <Link
            className="bg-white/16 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href={`/matches/${nextUpcomingMatch.id}`}
          >
            {competitionTitle}
          </Link>
          <div className="mt-5 grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Link
              className="min-w-0 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={`/teams/${nextUpcomingMatch.homeTeam.slug}`}
            >
              <span className="flex min-w-0 items-center justify-end gap-2 overflow-hidden text-base font-black leading-tight">
                <span className="truncate">
                  {nextUpcomingMatch.homeTeam.name}
                </span>
                <TeamBadge
                  shortCode={nextUpcomingMatch.homeTeam.shortCode}
                  size={24}
                  slug={nextUpcomingMatch.homeTeam.slug}
                />
              </span>
            </Link>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-[var(--color-ink)] shadow-sm">
              対
            </span>
            <Link
              className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={`/teams/${nextUpcomingMatch.awayTeam.slug}`}
            >
              <span className="flex min-w-0 items-center gap-2 overflow-hidden text-base font-black leading-tight">
                <TeamBadge
                  shortCode={nextUpcomingMatch.awayTeam.shortCode}
                  size={24}
                  slug={nextUpcomingMatch.awayTeam.slug}
                />
                <span className="truncate">
                  {nextUpcomingMatch.awayTeam.name}
                </span>
              </span>
            </Link>
          </div>
          <p className="mt-4 text-center text-xs font-bold text-white/75">
            {formatKickoffJstDate(nextUpcomingMatch.kickoffAt)}{" "}
            {formatKickoffJstTime(nextUpcomingMatch.kickoffAt)}
          </p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Link
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-center text-xs font-bold text-white transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href={`/matches/${nextUpcomingMatch.id}`}
          >
            試合の詳細を見る
          </Link>
          <Link
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-center text-xs font-bold text-white transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href="/calendar"
          >
            カレンダーを見る
          </Link>
          <Link
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-center text-xs font-bold text-white transition-colors hover:bg-white/[0.10] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            href="/?notifications=open"
          >
            通知設定を開く
          </Link>
        </div>
        <p className="mt-3 text-center text-[11px] leading-5 text-white/55">
          応援したいチームを選ぶと、チームページからお気に入りに登録できます。
        </p>
      </aside>
    );
  }

  const focusMatch =
    matches.find((match) => match.id === focusMatchId) ?? matches[0] ?? null;

  if (!focusMatch) {
    return null;
  }

  const quickMatches = matches
    .filter((match) => match.id !== focusMatch.id)
    .slice(0, 3);
  const overflowCount = Math.max(0, matches.length - 1 - quickMatches.length);
  const levelMetric = getLevelMetric(focusMatch, standingPositions);
  const metrics: BoardMetric[] = [
    { label: "キックオフ", value: formatKickoffJstTime(focusMatch.kickoffAt) },
    ...(levelMetric ? [{ label: "順位情報", value: levelMetric }] : []),
    { label: "コンテンツ", value: getContentLabel(focusMatch) },
  ];

  return (
    <aside
      aria-label="今週の注目試合"
      className="border-white/12 rounded-[22px] border bg-white/[0.08] p-4 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--color-accent)]">
          Matchday Board
        </p>
        <p className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/70">
          {weekLabel}
        </p>
      </div>

      <Link
        className="mt-4 block overflow-hidden rounded-2xl p-4 text-white shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        href={`/matches/${focusMatch.id}`}
        style={{
          background: `linear-gradient(160deg, rgb(12 16 28 / 42%), rgb(12 16 28 / 20%)), linear-gradient(135deg, ${getTeamColor(focusMatch.homeTeam.slug)}33, ${getTeamColor(focusMatch.awayTeam.slug)}33)`,
        }}
      >
        <span className="bg-white/16 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm">
          {formatCompetitionTitle(
            focusMatch.competition,
            focusMatch.competition.season,
          )}
        </span>
        <div className="mt-5 grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0 text-right">
            <p className="flex min-w-0 items-center justify-end gap-2 overflow-hidden text-base font-black leading-tight">
              <span className="truncate">{focusMatch.homeTeam.name}</span>
              <TeamBadge
                shortCode={focusMatch.homeTeam.shortCode}
                size={24}
                slug={focusMatch.homeTeam.slug}
              />
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-[var(--color-ink)] shadow-sm">
            対
          </span>
          <div className="min-w-0 text-left">
            <p className="flex min-w-0 items-center gap-2 overflow-hidden text-base font-black leading-tight">
              <TeamBadge
                shortCode={focusMatch.awayTeam.shortCode}
                size={24}
                slug={focusMatch.awayTeam.slug}
              />
              <span className="truncate">{focusMatch.awayTeam.name}</span>
            </p>
          </div>
        </div>
      </Link>

      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2"
            key={metric.label}
          >
            <dt className="text-[10px] font-bold uppercase tracking-wide text-white/45">
              {metric.label}
            </dt>
            <dd className="mt-1 truncate text-xs font-black text-white">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      {quickMatches.length > 0 && (
        <div className="mt-4 space-y-2">
          {quickMatches.map((match) => (
            <MatchMiniRow key={match.id} match={match} />
          ))}
        </div>
      )}

      {overflowCount > 0 && (
        <Link
          className="mt-3 inline-flex text-xs font-bold text-white/70 transition-colors hover:text-white"
          href="/calendar"
        >
          ほか{overflowCount}試合 →
        </Link>
      )}
    </aside>
  );
}
