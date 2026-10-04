import Link from "next/link";

import { HomepageSpoilerScore } from "@/components/home-user-state";
import { formatCompetitionTitle } from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getTeamColor, getTeamStripe } from "@/lib/format/team-identity";

import type { StandingPositionLookup } from "@/lib/db/queries/standings";
import type { HomeBoardMatch } from "@/lib/home-selection";

type HomeMatchdayBoardProps = {
  focusMatchId: string | null;
  matches: HomeBoardMatch[];
  standingPositions: StandingPositionLookup;
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

function getContentLabel(match: HomeBoardMatch): string {
  if (match.hasRecap) {
    return "レビュー公開";
  }

  if (match.hasPreview) {
    return "プレビュー公開";
  }

  if (match.status === "finished") return "結果";

  return "試合前";
}

function getLevelMetric(
  match: HomeBoardMatch,
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

function MatchMiniRow({
  match,
  focused = false,
  levelMetric,
}: {
  match: HomeBoardMatch;
  focused?: boolean;
  levelMetric?: string | null;
}) {
  return (
    <Link
      data-match-layout="row"
      style={
        {
          "--team-home": getTeamColor(match.homeTeam.slug),
          "--team-away": getTeamColor(match.awayTeam.slug),
        } as React.CSSProperties
      }
      className={`tl-hover group grid min-h-[76px] min-w-0 grid-cols-[76px_minmax(0,1fr)_64px] items-center gap-2 border-b border-[var(--color-rule)] bg-card px-3 py-3 hover:bg-[var(--color-panel)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:grid-cols-[104px_minmax(0,1fr)_80px] sm:gap-3 ${focused ? "border-l-4 border-l-[var(--color-accent)]" : ""}`}
      href={`/matches/${match.id}`}
    >
      <time
        className="text-[10px] tabular-nums leading-relaxed text-[var(--color-ink-muted)] sm:text-xs"
        dateTime={match.kickoffAt}
      >
        <span className="block">
          {formatKickoffJstDate(match.kickoffAt).slice(5)}
        </span>
        <span className="block">{formatKickoffJstTime(match.kickoffAt)}</span>
      </time>
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold sm:text-sm">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[0.85em] w-1 shrink-0 border border-black/15"
              style={{ background: getTeamStripe(match.homeTeam.slug) }}
            />
            <span className="break-words">{match.homeTeam.name}</span>
          </span>
          <span className="text-[10px] font-normal text-[var(--color-ink-muted)]">
            対
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[0.85em] w-1 shrink-0 border border-black/15"
              style={{ background: getTeamStripe(match.awayTeam.slug) }}
            />
            <span className="break-words">{match.awayTeam.name}</span>
          </span>
        </span>
        <span className="mt-1 block text-[10px] leading-relaxed text-[var(--color-ink-muted)]">
          {formatCompetitionTitle(match.competition, match.competition.season)}{" "}
          ·{" "}
          <span className="text-[var(--color-brass)]">
            {getContentLabel(match)}
          </span>
          {levelMetric && <> · {levelMetric}</>}
        </span>
      </span>
      <span className="flex min-h-11 items-center justify-end text-right text-lg font-bold tabular-nums sm:text-xl">
        {match.homeScore !== null && match.awayScore !== null ? (
          <HomepageSpoilerScore className="min-h-11 max-w-full px-1 text-[10px]">
            <span>
              {match.homeScore}–{match.awayScore}
            </span>
          </HomepageSpoilerScore>
        ) : (
          <span className="font-normal text-[var(--color-ink-muted)]">—</span>
        )}
      </span>
    </Link>
  );
}

export function HomeMatchdayBoard({
  focusMatchId,
  matches,
  standingPositions,
}: HomeMatchdayBoardProps) {
  const focusMatch =
    matches.find((match) => match.id === focusMatchId) ?? matches[0] ?? null;

  if (!focusMatch) {
    return null;
  }

  const levelMetric = getLevelMetric(focusMatch, standingPositions);

  return (
    <aside aria-label="これからの試合の一覧">
      <ul className="tl-home-schedule grid border-t border-[var(--color-rule)] md:grid-cols-2">
        {matches.map((match) => (
          <li className="min-w-0" key={match.id}>
            <MatchMiniRow
              focused={match.id === focusMatch.id}
              levelMetric={match.id === focusMatch.id ? levelMetric : null}
              match={match}
            />
          </li>
        ))}
      </ul>
    </aside>
  );
}
