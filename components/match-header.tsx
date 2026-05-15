import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatKickoffJst, formatKickoffLocal } from "@/lib/format/kickoff";
import { getMatchOutcome } from "@/lib/format/match-outcome";
import { getTeamColor } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";
import { TeamBadge } from "./team-badge";

import type { MatchDetail } from "@/lib/db/queries/matches";

type MatchHeaderProps = {
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

export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);
  const outcome = getMatchOutcome(match);
  const homeColor = getTeamColor(match.homeTeam.slug);
  const awayColor = getTeamColor(match.awayTeam.slug);

  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[4px]"
        style={{
          background: `linear-gradient(to right, ${homeColor} 50%, ${awayColor} 50%)`,
        }}
      />
      <h1 className="sr-only font-heading">
        {match.homeTeam.name} vs {match.awayTeam.name}
      </h1>
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {formatCompetitionTitle(
              match.competition.name,
              match.competition.season,
            )}
            {match.round !== null ? ` · Round ${match.round}` : ""}
          </p>
          <StatusBadge status={match.status} />
        </div>
      </div>

      <div
        className="px-5 py-7 sm:px-6 sm:py-8"
        style={{
          background: `linear-gradient(135deg, ${homeColor}18 0%, transparent 60%)`,
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
          <TeamBlock
            align="right"
            dimmed={outcome === "away_win"}
            name={match.homeTeam.name}
            slug={match.homeTeam.slug}
            shortCode={match.homeTeam.shortCode}
          />

          <p
            className={cn(
              "px-1 text-center text-4xl font-black tabular-nums tracking-tight sm:px-4 sm:text-5xl",
              match.status === "finished" ? "text-slate-950" : "text-slate-300",
            )}
          >
            {match.status === "finished"
              ? `${match.homeScore ?? 0} – ${match.awayScore ?? 0}`
              : "—"}
          </p>

          <TeamBlock
            align="left"
            dimmed={outcome === "home_win"}
            name={match.awayTeam.name}
            slug={match.awayTeam.slug}
            shortCode={match.awayTeam.shortCode}
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <time dateTime={match.kickoffAt}>
            <span className="font-semibold text-slate-700">JST</span>{" "}
            {formatKickoffJst(match.kickoffAt)}
          </time>
          <time dateTime={match.kickoffAt}>
            <span className="font-semibold text-slate-700">現地</span>{" "}
            {formatKickoffLocal(match.kickoffAt, localTimezone)}
          </time>
          {match.venue && <span>{match.venue}</span>}
        </div>

        {match.status === "finished" && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <a
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              href={buildYouTubeSearchUrl(
                match.homeTeam.name,
                match.awayTeam.name,
                match.kickoffAt,
              )}
              rel="noreferrer noopener"
              target="_blank"
            >
              <svg
                aria-hidden
                className="h-4 w-4 text-white"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              YouTube でハイライトを検索
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function TeamBlock({
  align,
  dimmed,
  name,
  slug,
  shortCode,
}: {
  align: "left" | "right";
  dimmed: boolean;
  name: string;
  slug: string;
  shortCode: string;
}) {
  return (
    <div
      className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}
    >
      <p
        className={cn(
          "flex min-w-0 items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl",
          align === "right" ? "justify-end" : "justify-start",
          dimmed ? "text-slate-400" : "text-slate-900",
        )}
      >
        <span
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5",
            align === "right" ? "flex-row-reverse" : "flex-row",
          )}
        >
          <TeamBadge shortCode={shortCode} size={28} slug={slug} />
          <span className="min-w-0 truncate">{shortCode}</span>
        </span>
      </p>
      <p
        className={cn(
          "mt-1 max-w-[9rem] whitespace-normal break-words text-xs font-medium leading-tight sm:max-w-none sm:truncate sm:whitespace-nowrap sm:text-sm",
          dimmed ? "text-slate-300" : "text-slate-400",
        )}
      >
        {name}
      </p>
    </div>
  );
}
