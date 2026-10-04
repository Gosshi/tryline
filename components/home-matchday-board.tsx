import Link from "next/link";

import { HomepageSpoilerScore } from "@/components/home-user-state";
import { formatCompetitionTitle } from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getTeamStripe } from "@/lib/format/team-identity";

import type { CalendarMatch } from "@/lib/db/queries/matches";
import type { StandingPositionLookup } from "@/lib/db/queries/standings";

type HomeMatchdayBoardProps = {
  focusMatchId: string | null;
  matches: CalendarMatch[];
  standingPositions: StandingPositionLookup;
  weekLabel: string;
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

function MatchMiniRow({
  match,
  focused = false,
  levelMetric,
}: {
  match: CalendarMatch;
  focused?: boolean;
  levelMetric?: string | null;
}) {
  return (
    <Link
      className={`group block min-w-0 rounded-sm border border-[var(--color-rule)] bg-card px-4 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${focused ? "border-l-4 border-l-[var(--color-accent)]" : ""}`}
      href={`/matches/${match.id}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-ink-muted)]">
        <time className="tabular-nums" dateTime={match.kickoffAt}>
          {formatKickoffJstDate(match.kickoffAt)}{" "}
          {formatKickoffJstTime(match.kickoffAt)}
        </time>
        <span>
          {formatCompetitionTitle(match.competition, match.competition.season)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-base font-bold text-[var(--color-ink)]">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-4 w-1 shrink-0 border border-black/10"
            style={{ background: getTeamStripe(match.homeTeam.slug) }}
          />
          {match.homeTeam.name}
        </span>
        {match.homeScore !== null && match.awayScore !== null ? (
          <HomepageSpoilerScore>
            <span className="tabular-nums">
              {match.homeScore}–{match.awayScore}
            </span>
          </HomepageSpoilerScore>
        ) : (
          <span className="text-xs font-normal text-[var(--color-ink-muted)]">
            対
          </span>
        )}
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="h-4 w-1 shrink-0 border border-black/10"
            style={{ background: getTeamStripe(match.awayTeam.slug) }}
          />
          {match.awayTeam.name}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink-muted)]">
        <span className="font-semibold text-[var(--color-brass)]">
          {getContentLabel(match)}
        </span>
        {levelMetric && <span className="tabular-nums">{levelMetric}</span>}
      </div>
    </Link>
  );
}

export function HomeMatchdayBoard({
  focusMatchId,
  matches,
  standingPositions,
  weekLabel,
}: HomeMatchdayBoardProps) {
  const focusMatch =
    matches.find((match) => match.id === focusMatchId) ?? matches[0] ?? null;

  if (!focusMatch) {
    return null;
  }

  const levelMetric = getLevelMetric(focusMatch, standingPositions);
  const orderedMatches = [
    focusMatch,
    ...matches.filter((match) => match.id !== focusMatch.id),
  ];

  return (
    <aside aria-label="今週の注目試合">
      <p className="sr-only">{weekLabel}</p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {orderedMatches.map((match) => (
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
