import Link from "next/link";

import { formatKickoffJst } from "@/lib/format/kickoff";
import { getMatchOutcome } from "@/lib/format/match-outcome";
import { getTeamStripe } from "@/lib/format/team-identity";
import { formatVenueDisplay } from "@/lib/format/venue-timezone";
import { cn } from "@/lib/utils";

import { StatusBadge } from "./status-badge";
import { TeamBadge } from "./team-badge";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";

type MatchCardProps = {
  contentStatus?: MatchContentStatus;
  href?: string;
  match: MatchListItem;
};

export function MatchCard({ contentStatus, href, match }: MatchCardProps) {
  const outcome = getMatchOutcome(match);
  const homeWon = outcome === "home_win";
  const awayWon = outcome === "away_win";
  const shouldShowContentStatus =
    contentStatus && (contentStatus.hasPreview || contentStatus.hasRecap);

  return (
    <Link
      className="block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={href ?? `/matches/${match.id}`}
    >
      <article className="relative h-full overflow-hidden rounded-sm border border-[var(--color-rule)] bg-card p-5 transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--color-ink-muted)] active:scale-[0.98]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <time
            className="text-xs font-medium text-[var(--color-ink-muted)]"
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
                size={28}
                slug={match.homeTeam.slug}
              />
              {match.homeTeam.shortCode}
              {homeWon && match.status === "finished" && (
                <span className="rounded bg-[var(--color-accent-dim)] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-accent)]">
                  W
                </span>
              )}
              {awayWon && match.status === "finished" && (
                <span className="rounded-sm bg-[var(--color-panel)] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-ink-muted)]">
                  L
                </span>
              )}
            </p>
            <p
              className={cn(
                "flex min-w-0 items-center justify-end gap-1.5 text-xs leading-tight",
                awayWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              <span
                aria-hidden="true"
                className="h-[0.85em] w-1 shrink-0 rounded-[1px] border border-black/15"
                style={{ background: getTeamStripe(match.homeTeam.slug) }}
              />
              <span>{match.homeTeam.name}</span>
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
                <span className="rounded-sm bg-[var(--color-panel)] px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-[var(--color-ink-muted)]">
                  L
                </span>
              )}
              <TeamBadge
                shortCode={match.awayTeam.shortCode}
                size={28}
                slug={match.awayTeam.slug}
              />
            </p>
            <p
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-xs leading-tight",
                homeWon
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink)]",
              )}
            >
              <span
                aria-hidden="true"
                className="h-[0.85em] w-1 shrink-0 rounded-[1px] border border-black/15"
                style={{ background: getTeamStripe(match.awayTeam.slug) }}
              />
              <span>{match.awayTeam.name}</span>
            </p>
          </div>
        </div>

        {match.venue && (
          <p
            className="mt-4 truncate text-xs text-[var(--color-ink-muted)]"
            title={formatVenueDisplay(match.venue)}
          >
            {formatVenueDisplay(match.venue)}
          </p>
        )}

        {shouldShowContentStatus && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contentStatus.hasPreview && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                プレビューあり
              </span>
            )}
            {contentStatus.hasRecap && (
              <span className="bg-[var(--color-accent)]/10 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]">
                レビューあり
              </span>
            )}
          </div>
        )}
      </article>
    </Link>
  );
}
