import Link from "next/link";

import { HomepageSpoilerScore } from "@/components/home-user-state";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
  formatKickoffJst,
} from "@/lib/format/kickoff";
import { getMatchOutcome } from "@/lib/format/match-outcome";
import { getTeamColor, getTeamStripe } from "@/lib/format/team-identity";
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
  layout?: "card" | "row";
};

export function MatchCard({
  contentStatus,
  href,
  match,
  layout = "card",
}: MatchCardProps) {
  if (layout === "row")
    return (
      <MatchListRow contentStatus={contentStatus} href={href} match={match} />
    );
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
      <article
        style={
          {
            "--team-home": getTeamColor(match.homeTeam.slug),
            "--team-away": getTeamColor(match.awayTeam.slug),
          } as React.CSSProperties
        }
        className="tl-hover relative h-full overflow-hidden rounded-sm border border-[var(--color-rule)] bg-card p-5 transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--color-ink-muted)] active:scale-[0.98]"
      >
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

function MatchListRow({ contentStatus, href, match }: MatchCardProps) {
  const showScore =
    (match.status === "finished" || match.status === "in_progress") &&
    match.homeScore !== null &&
    match.awayScore !== null;
  return (
    <Link
      data-match-layout="row"
      style={
        {
          "--team-home": getTeamColor(match.homeTeam.slug),
          "--team-away": getTeamColor(match.awayTeam.slug),
        } as React.CSSProperties
      }
      className="tl-hover group grid min-h-[72px] min-w-0 grid-cols-[76px_minmax(0,1fr)_64px] items-center gap-2 bg-card px-3 py-3 text-[var(--color-ink)] hover:bg-[var(--color-panel)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:grid-cols-[104px_minmax(0,1fr)_80px] sm:gap-3"
      href={href ?? `/matches/${match.id}`}
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
        {contentStatus &&
          (contentStatus.hasPreview || contentStatus.hasRecap) && (
            <span className="mt-1 block text-[10px] text-[var(--color-brass)]">
              {contentStatus.hasRecap ? "レビューあり" : "プレビューあり"}
            </span>
          )}
      </span>
      <span className="flex min-h-11 items-center justify-end text-right text-lg font-bold tabular-nums sm:text-xl">
        {showScore ? (
          <HomepageSpoilerScore className="min-h-11 max-w-full px-1 text-[10px]">
            <span>
              {match.homeScore}–{match.awayScore}
            </span>
          </HomepageSpoilerScore>
        ) : (
          <span className="text-[10px] font-medium text-[var(--color-ink-muted)]">
            {match.status === "scheduled" ? (
              "—"
            ) : (
              <StatusBadge status={match.status} />
            )}
          </span>
        )}
      </span>
    </Link>
  );
}
