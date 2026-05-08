import Link from "next/link";

import { formatKickoffJst } from "@/lib/format/kickoff";
import { getMatchOutcome } from "@/lib/format/match-outcome";
import { getTeamColor, getTeamStripe } from "@/lib/format/team-identity";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";
import { TeamBadge } from "./team-badge";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";

type MatchCardProps = {
  contentStatus?: MatchContentStatus;
  match: MatchListItem;
};

export function MatchCard({ contentStatus, match }: MatchCardProps) {
  const outcome = getMatchOutcome(match);
  const homeWon = outcome === "home_win";
  const awayWon = outcome === "away_win";
  const shouldShowContentStatus =
    contentStatus &&
    match.status === "finished" &&
    (contentStatus.hasPreview || contentStatus.hasRecap);

  return (
    <Link
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={`/matches/${match.id}`}
    >
      <article
        className="relative h-full overflow-hidden rounded-xl border border-slate-200 p-5 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_18px_rgb(15_23_42/0.10)]"
        style={{
          background: `linear-gradient(to right, ${getTeamColor(match.homeTeam.slug)}0a 0%, #ffffff 35%, #ffffff 65%, ${getTeamColor(match.awayTeam.slug)}0a 100%)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[4px]"
          style={{
            background: getTeamStripe(match.homeTeam.slug, "vertical"),
            opacity: match.status === "finished" && awayWon ? 0.25 : 1,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-[4px]"
          style={{
            background: getTeamStripe(match.awayTeam.slug, "vertical"),
            opacity: match.status === "finished" && homeWon ? 0.25 : 1,
          }}
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
                "flex items-center justify-end gap-1.5 text-base font-bold sm:text-xl",
                awayWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              <TeamBadge
                shortCode={match.homeTeam.shortCode}
                size={20}
                slug={match.homeTeam.slug}
              />
              {match.homeTeam.shortCode}
              {homeWon && match.status === "finished" && (
                <span className="rounded bg-[var(--color-accent-dim)] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-accent)]">
                  W
                </span>
              )}
              {awayWon && match.status === "finished" && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                  L
                </span>
              )}
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
              "px-3 font-body text-3xl tabular-nums",
              match.status === "finished" ? "" : "text-[var(--color-rule)]",
            )}
          >
            {match.status === "finished" ? (
              <>
                <span
                  className={
                    homeWon
                      ? "text-4xl font-black text-[var(--color-accent)]"
                      : awayWon
                        ? "text-3xl text-[var(--color-ink-muted)]"
                        : "text-3xl text-[var(--color-ink)]"
                  }
                >
                  {match.homeScore ?? 0}
                </span>
                <span className="mx-1 text-[var(--color-rule)]">–</span>
                <span
                  className={
                    awayWon
                      ? "text-4xl font-black text-[var(--color-accent)]"
                      : homeWon
                        ? "text-3xl text-[var(--color-ink-muted)]"
                        : "text-3xl text-[var(--color-ink)]"
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
                "flex items-center gap-1.5 text-base font-bold sm:text-xl",
                homeWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              {match.awayTeam.shortCode}
              {awayWon && match.status === "finished" && (
                <span className="rounded bg-[var(--color-accent-dim)] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-accent)]">
                  W
                </span>
              )}
              {homeWon && match.status === "finished" && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-400">
                  L
                </span>
              )}
              <TeamBadge
                shortCode={match.awayTeam.shortCode}
                size={20}
                slug={match.awayTeam.slug}
              />
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

        {shouldShowContentStatus && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contentStatus.hasPreview && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                プレビュー
              </span>
            )}
            {contentStatus.hasRecap && (
              <span className="rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                レビュー
              </span>
            )}
          </div>
        )}
      </article>
    </Link>
  );
}
