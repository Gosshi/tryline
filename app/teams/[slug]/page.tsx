import Link from "next/link";
import { notFound } from "next/navigation";

import { FavoriteTeamFollowButton } from "@/components/favorite-team-follow-button";
import { MatchCard } from "@/components/match-card";
import { TeamBadge } from "@/components/team-badge";
import { TeamPlayersSection } from "@/components/team-players-section";
import { TeamStatsPanel } from "@/components/team-stats-panel";
import { getUser, getUserProfile } from "@/lib/auth/server";
import { getMatchBroadcastsForMatches } from "@/lib/db/queries/match-broadcasts";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import { getPlayersByTeamSlug } from "@/lib/db/queries/players";
import { getTeamStatsDataBySlug } from "@/lib/db/queries/team-stats";
import { getTeamPageDataBySlug } from "@/lib/db/queries/teams";
import { getTeamColor } from "@/lib/format/team-identity";
import { SITE_URL } from "@/lib/site";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { TeamMatchItem } from "@/lib/db/queries/teams";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 60;

function toMatchCardItem(match: TeamMatchItem): MatchListItem {
  return {
    ...match,
    awayTeam: {
      ...match.awayTeam,
      shortCode:
        match.awayTeam.shortCode ??
        match.awayTeam.name.slice(0, 3).toUpperCase(),
    },
    homeTeam: {
      ...match.homeTeam,
      shortCode:
        match.homeTeam.shortCode ??
        match.homeTeam.name.slice(0, 3).toUpperCase(),
    },
    poolName: null,
    roundName: null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTeamPageDataBySlug(slug);

  if (!data) {
    return { title: "Tryline" };
  }

  return {
    alternates: {
      canonical: `${SITE_URL}/teams/${data.team.slug}`,
    },
    description: `${data.team.nameJa ?? data.team.name}の次戦・直近の試合結果・日程を掲載。日本語レビューも。`,
    title: `${data.team.nameJa ?? data.team.name} 次戦・日程・結果`,
  };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const user = await getUser();
  const [data, stats, players, profile] = await Promise.all([
    getTeamPageDataBySlug(slug),
    getTeamStatsDataBySlug(slug).catch(() => null),
    getPlayersByTeamSlug(slug),
    user ? getUserProfile(user.id) : null,
  ]);

  if (!data) {
    notFound();
  }

  const nowIso = new Date().toISOString();
  const upcomingMatches = data.upcomingMatches.filter(
    (match) => match.kickoffAt >= nowIso,
  );
  const allMatches = [...data.recentMatches, ...upcomingMatches];
  const [contentStatusMap, broadcastsByMatch] = await Promise.all([
    getContentStatusMap(allMatches.map((match) => match.id)),
    getMatchBroadcastsForMatches(upcomingMatches.map((match) => match.id)),
  ]);
  const emptyStatus = { hasPreview: false, hasRecap: false };
  const teamColor = getTeamColor(data.team.slug);
  const favoriteTeamSlugs = profile?.favorite_team_slugs ?? [];

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
        <nav aria-label="パンくずリスト">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-[var(--color-ink-muted)]">
            <li>
              <Link
                className="transition-colors hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href="/"
              >
                Tryline
              </Link>
            </li>
            <li aria-hidden className="select-none">
              /
            </li>
            <li className="text-[var(--color-ink)]">
              {data.team.nameJa ?? data.team.name}
            </li>
          </ol>
        </nav>

        <section
          className="relative overflow-hidden rounded-xl border border-slate-200 p-5 shadow-sm shadow-slate-200/50 sm:p-6"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${teamColor} 12%, #fff), #fff 70%)`,
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <TeamBadge
                shortCode={
                  data.team.shortCode ??
                  data.team.name.slice(0, 3).toUpperCase()
                }
                size={64}
                slug={data.team.slug}
              />
              <div className="min-w-0">
                <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
                  {data.team.nameJa ?? data.team.name}
                </h1>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {data.team.country || "Unknown"}
                </p>
              </div>
            </div>
            {user && (
              <FavoriteTeamFollowButton
                initialFavoriteTeamSlugs={favoriteTeamSlugs}
                source="team_page"
                teamName={data.team.nameJa ?? data.team.name}
                teamSlug={data.team.slug}
              />
            )}
          </div>
        </section>

        {stats && (
          <TeamStatsPanel
            record={stats.record}
            scoring={stats.scoring}
            topScorers={stats.topScorers}
          />
        )}

        {upcomingMatches.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              次戦
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {upcomingMatches.map((match) => (
                <div className="space-y-2" key={match.id}>
                  <MatchCard
                    contentStatus={contentStatusMap.get(match.id) ?? emptyStatus}
                    match={toMatchCardItem(match)}
                  />
                  {(broadcastsByMatch.get(match.id) ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1">
                      {(broadcastsByMatch.get(match.id) ?? []).map(
                        (broadcast) => (
                          <a
                            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[var(--color-ink)] transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                            href={broadcast.url}
                            key={`${broadcast.kind}:${broadcast.serviceName}`}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <span className="rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                              {broadcast.kind === "tv" ? "テレビ" : "配信"}
                            </span>
                            <span>{broadcast.serviceName}</span>
                            <span aria-hidden className="text-[var(--color-accent)]">
                              ↗
                            </span>
                          </a>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            直近の試合
          </h2>
          {data.recentMatches.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              試合データがありません
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.recentMatches.map((match) => (
                <MatchCard
                  contentStatus={contentStatusMap.get(match.id) ?? emptyStatus}
                  key={match.id}
                  match={toMatchCardItem(match)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            選手
          </h2>
          <TeamPlayersSection players={players} />
        </section>
      </div>
    </main>
  );
}
