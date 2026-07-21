"use client";

import Link from "next/link";

import { FavoriteTeamFollowButton } from "@/components/favorite-team-follow-button";
import { MatchHeader } from "@/components/match-header";
import { useUserState } from "@/components/user-state-provider";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";

import type {
  MatchDetail,
  RecentlyReviewedMatch,
  TeamNextMatch,
} from "@/lib/db/queries/matches";

type MatchTeams = Array<{
  id: string;
  name: string;
  slug: string;
  source?: string;
}>;

export function MatchDetailHeader({
  headToHeadHref,
  match,
}: {
  headToHeadHref: string | null;
  match: MatchDetail;
}) {
  const userState = useUserState();

  return (
    <MatchHeader
      headToHeadHref={headToHeadHref}
      match={match}
      spoilerGuardEnabled={userState?.spoilerGuardEnabled ?? false}
    />
  );
}

export function MatchFavoriteTeamControls({ teams }: { teams: MatchTeams }) {
  const userState = useUserState();

  if (!userState?.user) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {teams.map((team) => (
        <FavoriteTeamFollowButton
          initialFavoriteTeamSlugs={userState.favoriteTeamSlugs}
          key={team.id}
          source={team.source ?? "match_detail_team"}
          teamName={team.name}
          teamSlug={team.slug}
        />
      ))}
    </div>
  );
}

export function NextWatchSection({
  nextMatches,
  relatedRecaps,
  teams,
}: {
  nextMatches: TeamNextMatch[];
  relatedRecaps: RecentlyReviewedMatch[];
  teams: MatchTeams;
}) {
  const userState = useUserState();
  const nextMatchByTeam = new Map(
    nextMatches.map((entry) => [entry.teamId, entry.match]),
  );

  return (
    <section className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Next
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          次に見る
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team) => {
          const nextMatch = nextMatchByTeam.get(team.id) ?? null;

          return (
            <article
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              key={team.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--color-ink-muted)]">
                    {team.name} の次戦
                  </p>
                  {nextMatch ? (
                    <Link
                      className="mt-1 block text-sm font-bold text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent)]"
                      href={`/matches/${nextMatch.id}`}
                    >
                      {nextMatch.homeTeam.name} 対 {nextMatch.awayTeam.name}
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      次戦は未定です
                    </p>
                  )}
                </div>
                {nextMatch && (
                  <time
                    className="shrink-0 text-right text-xs tabular-nums text-[var(--color-ink-muted)]"
                    dateTime={nextMatch.kickoffAt}
                  >
                    <span className="block font-semibold text-[var(--color-accent)]">
                      {formatKickoffJstDate(nextMatch.kickoffAt)}
                    </span>
                    {formatKickoffJstTime(nextMatch.kickoffAt)}
                  </time>
                )}
              </div>
              <div className="mt-3">
                {userState?.user ? (
                  <FavoriteTeamFollowButton
                    className="min-h-9 px-3 py-1.5"
                    initialFavoriteTeamSlugs={userState.favoriteTeamSlugs}
                    source="match_detail_next_watch"
                    teamName={team.name}
                    teamSlug={team.slug}
                  />
                ) : (
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-ink)] transition-colors hover:border-slate-300 hover:text-[var(--color-accent)]"
                    href={`/teams/${team.slug}`}
                  >
                    このチームを追う
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {relatedRecaps.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-bold text-[var(--color-ink)]">
            同じ大会のレビュー
          </h3>
          <ul className="mt-3 space-y-2">
            {relatedRecaps.map((recap) => (
              <li key={recap.id}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm transition-colors hover:border-slate-200 hover:bg-slate-50"
                  href={`/matches/${recap.id}`}
                >
                  <span className="min-w-0 truncate font-semibold text-[var(--color-ink)]">
                    {recap.homeTeam.name} 対 {recap.awayTeam.name}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-[var(--color-accent)]">
                    読む →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 sm:w-auto"
        href="/calendar"
      >
        今週の全試合を見る
      </Link>
    </section>
  );
}
