import Link from "next/link";

import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatKickoffJst, formatKickoffLocal } from "@/lib/format/kickoff";
import { getMatchOutcome } from "@/lib/format/match-outcome";
import { formatRoundLabel } from "@/lib/format/round-label";
import { getTeamColor } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";
import { TeamBadge } from "./team-badge";

import type { MatchDetail } from "@/lib/db/queries/matches";

type MatchHeaderProps = {
  awayDisplayName?: string;
  headToHeadHref?: string | null;
  homeDisplayName?: string;
  match: MatchDetail;
};

const TEAM_TIMEZONES: Record<string, string> = {
  england: "Europe/London",
  france: "Europe/Paris",
  ireland: "Europe/Dublin",
  italy: "Europe/Rome",
  scotland: "Europe/London",
  wales: "Europe/London",
};

function getVenueTimezone(teamSlug: string) {
  return TEAM_TIMEZONES[teamSlug] ?? "Europe/London";
}

function buildYouTubeSearchUrl(
  homeTeamName: string,
  awayTeamName: string,
  kickoffAt: string,
): string {
  const year = new Date(kickoffAt).getFullYear();
  const query = `${homeTeamName} vs ${awayTeamName} ${year} highlights`;

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function MatchHeader({
  awayDisplayName,
  headToHeadHref,
  homeDisplayName,
  match,
}: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);
  const outcome = getMatchOutcome(match);
  const homeColor = getTeamColor(match.homeTeam.slug);
  const awayColor = getTeamColor(match.awayTeam.slug);
  const homeName = homeDisplayName ?? match.homeTeam.name;
  const awayName = awayDisplayName ?? match.awayTeam.name;
  const showScore =
    (match.status === "finished" || match.status === "in_progress") &&
    match.homeScore !== null &&
    match.awayScore !== null;

  return (
    <section
      className="relative isolate overflow-hidden rounded-[var(--radius-lg)] px-4 py-5 text-white shadow-[var(--shadow)] sm:px-7 sm:py-7"
      style={
        {
          "--team-away": awayColor,
          "--team-home": homeColor,
          background: `
            linear-gradient(180deg, rgb(12 16 28 / 16%), rgb(12 16 28 / 38%)),
            radial-gradient(135% 110% at 6% 0%, color-mix(in srgb, ${homeColor} 92%, transparent), transparent 62%),
            radial-gradient(135% 110% at 96% 100%, color-mix(in srgb, ${awayColor} 92%, transparent), transparent 62%),
            linear-gradient(135deg, ${homeColor}, ${awayColor})
          `,
        } as React.CSSProperties
      }
    >
      <h1 className="sr-only font-heading">
        {homeName} vs {awayName}
      </h1>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold backdrop-blur-sm sm:text-xs">
          {formatCompetitionTitle(match.competition, match.competition.season)}
          {match.round !== null
            ? ` · ${formatRoundLabel(match.round, match.competition.family)}`
            : ""}
        </p>
        {match.status === "in_progress" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-[11px] font-black text-white shadow-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
        ) : (
          <StatusBadge status={match.status} />
        )}
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:mt-8 sm:gap-5">
        <TeamBlock
          dimmed={outcome === "away_win"}
          isWinner={outcome === "home_win"}
          name={homeName}
          slug={match.homeTeam.slug}
          shortCode={match.homeTeam.shortCode}
        />

        <div className="min-w-[5.5rem] text-center sm:min-w-[10rem]">
          {showScore ? (
            <p className="flex items-center justify-center gap-1.5 font-number text-[clamp(2.25rem,10vw,4rem)] font-bold tabular-nums leading-none sm:gap-3">
              <ScoreNumber
                isWinner={outcome === "home_win"}
                score={match.homeScore ?? 0}
              />
              <span className="text-xl font-medium text-white/55 sm:text-2xl">
                –
              </span>
              <ScoreNumber
                isWinner={outcome === "away_win"}
                score={match.awayScore ?? 0}
              />
            </p>
          ) : (
            <p className="font-number text-xl font-bold text-white/70">VS</p>
          )}
        </div>

        <TeamBlock
          dimmed={outcome === "home_win"}
          isWinner={outcome === "away_win"}
          name={awayName}
          slug={match.awayTeam.slug}
          shortCode={match.awayTeam.shortCode}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-bold text-white/95 sm:mt-7 sm:text-xs">
        <time
          className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm"
          dateTime={match.kickoffAt}
        >
          {formatKickoffJst(match.kickoffAt)}
        </time>
        <time
          className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm"
          dateTime={match.kickoffAt}
        >
          現地 {formatKickoffLocal(match.kickoffAt, localTimezone)}
        </time>
        {match.venue && (
          <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
            {match.venue}
          </span>
        )}
      </div>

      {(match.status === "finished" || headToHeadHref) && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/15 pt-4">
          {match.status === "finished" && (
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#b4232a] transition-transform hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={buildYouTubeSearchUrl(homeName, awayName, match.kickoffAt)}
              rel="noreferrer noopener"
              target="_blank"
            >
              <svg
                aria-hidden
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              YouTube でハイライトを検索
            </a>
          )}
          {headToHeadHref && (
            <Link
              className="inline-flex min-h-11 items-center rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={headToHeadHref}
            >
              両者の対戦成績
              <span aria-hidden className="ml-1">
                →
              </span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function ScoreNumber({
  isWinner,
  score,
}: {
  isWinner: boolean;
  score: number;
}) {
  return (
    <span className="relative">
      {score}
      {isWinner && (
        <span className="absolute -right-1 -top-3 rounded-md bg-white px-1.5 py-0.5 font-number text-[8px] font-bold leading-none text-[var(--team-home)] sm:-right-2 sm:text-[9px]">
          WIN
        </span>
      )}
    </span>
  );
}

function TeamBlock({
  dimmed,
  isWinner,
  name,
  slug,
  shortCode,
}: {
  dimmed: boolean;
  isWinner: boolean;
  name: string;
  slug: string;
  shortCode: string;
}) {
  return (
    <div className={cn("min-w-0 text-center", dimmed && "opacity-70")}>
      <div
        className={cn(
          "mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/95 shadow-sm sm:h-14 sm:w-14",
          isWinner &&
            "ring-2 ring-white/70 ring-offset-2 ring-offset-transparent",
        )}
      >
        <TeamBadge shortCode={shortCode} size={36} slug={slug} />
      </div>
      <Link
        className="mx-auto mt-2 block max-w-[9rem] whitespace-normal break-words text-xs font-bold leading-tight text-white hover:underline sm:max-w-none sm:truncate sm:whitespace-nowrap sm:text-sm"
        href={`/teams/${slug}`}
        title={name}
      >
        {name}
      </Link>
      <span className="mt-0.5 block font-number text-[10px] font-bold text-white/65">
        {shortCode}
      </span>
    </div>
  );
}
