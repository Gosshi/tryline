import Link from "next/link";

import { formatKickoffJst } from "@/lib/format/kickoff";
import { getMatchOutcome } from "@/lib/format/match-outcome";
import { getTeamFlag, getTeamStripe } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";

import type { MatchListItem } from "@/lib/db/queries/matches";

type MatchCardProps = {
  match: MatchListItem;
};

export function MatchCard({ match }: MatchCardProps) {
  const outcome = getMatchOutcome(match);
  const homeWon = outcome === "home_win";
  const awayWon = outcome === "away_win";

  return (
    <Link
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={`/matches/${match.id}`}
    >
      <article className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[4px]"
          style={{ background: getTeamStripe(match.homeTeam.slug, "vertical") }}
        />
        <div className="mb-4 flex items-center justify-between gap-4">
          <time
            className="text-xs font-medium text-slate-500"
            dateTime={match.kickoffAt}
          >
            {formatKickoffJst(match.kickoffAt)}
          </time>
          {match.status !== "finished" && <StatusBadge status={match.status} />}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="text-right">
            <p
              className={cn(
                "truncate text-base font-bold sm:text-xl",
                awayWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              {getTeamFlag(match.homeTeam.slug)} {match.homeTeam.shortCode}
            </p>
            <p
              className={cn(
                "text-xs leading-tight",
                awayWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              {match.homeTeam.name}
            </p>
          </div>

          <p
            className={cn(
              "px-3 font-display text-3xl tabular-nums",
              match.status === "finished" ? "" : "text-[var(--color-rule)]",
            )}
          >
            {match.status === "finished" ? (
              <>
                <span
                  className={
                    homeWon
                      ? "text-[var(--color-ink)]"
                      : awayWon
                        ? "text-[var(--color-ink-muted)]"
                        : "text-[var(--color-ink)]"
                  }
                >
                  {match.homeScore ?? 0}
                </span>
                <span className="mx-1 text-[var(--color-rule)]">–</span>
                <span
                  className={
                    awayWon
                      ? "text-[var(--color-ink)]"
                      : homeWon
                        ? "text-[var(--color-ink-muted)]"
                        : "text-[var(--color-ink)]"
                  }
                >
                  {match.awayScore ?? 0}
                </span>
              </>
            ) : (
              "—"
            )}
          </p>

          <div className="text-left">
            <p
              className={cn(
                "truncate text-base font-bold sm:text-xl",
                homeWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              {match.awayTeam.shortCode} {getTeamFlag(match.awayTeam.slug)}
            </p>
            <p
              className={cn(
                "text-xs leading-tight",
                homeWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              {match.awayTeam.name}
            </p>
          </div>
        </div>

        {match.venue && (
          <p
            className="mt-4 truncate text-xs text-slate-400"
            title={match.venue}
          >
            {match.venue}
          </p>
        )}
      </article>
    </Link>
  );
}
