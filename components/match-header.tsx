import { formatCompetitionTitle } from "@/lib/format/competition";
import { formatKickoffJst, formatKickoffLocal } from "@/lib/format/kickoff";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";

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

function getScoreline(match: MatchDetail): string {
  if (match.status !== "finished") {
    return "—";
  }

  return `${match.homeScore ?? 0} – ${match.awayScore ?? 0}`;
}

export function MatchHeader({ match }: MatchHeaderProps) {
  const localTimezone = getVenueTimezone(match.homeTeam.slug);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
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

      <div className="px-5 py-7 sm:px-6 sm:py-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-5">
          <TeamBlock
            align="right"
            name={match.homeTeam.name}
            shortCode={match.homeTeam.shortCode}
          />

          <p
            className={cn(
              "px-1 text-center text-4xl font-black tabular-nums tracking-tight sm:px-4 sm:text-5xl",
              match.status === "finished" ? "text-slate-950" : "text-slate-300",
            )}
          >
            {getScoreline(match)}
          </p>

          <TeamBlock
            align="left"
            name={match.awayTeam.name}
            shortCode={match.awayTeam.shortCode}
          />
        </div>

        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
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
      </div>
    </section>
  );
}

function TeamBlock({
  align,
  name,
  shortCode,
}: {
  align: "left" | "right";
  name: string;
  shortCode: string;
}) {
  return (
    <div
      className={align === "right" ? "min-w-0 text-right" : "min-w-0 text-left"}
    >
      <p className="truncate text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
        {shortCode}
      </p>
      <p className="mt-1 truncate text-xs font-medium leading-tight text-slate-400 sm:text-sm">
        {name}
      </p>
    </div>
  );
}
