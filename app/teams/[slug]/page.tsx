import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import { TeamBadge } from "@/components/team-badge";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import { getTeamPageDataBySlug } from "@/lib/db/queries/teams";

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
        match.awayTeam.shortCode ?? match.awayTeam.name.slice(0, 3).toUpperCase(),
    },
    homeTeam: {
      ...match.homeTeam,
      shortCode:
        match.homeTeam.shortCode ?? match.homeTeam.name.slice(0, 3).toUpperCase(),
    },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTeamPageDataBySlug(slug);

  if (!data) {
    return { title: "Tryline" };
  }

  return {
    description: `${data.team.name}の最近の試合と次戦の日程`,
    title: `${data.team.name} | Tryline`,
  };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const data = await getTeamPageDataBySlug(slug);

  if (!data) {
    notFound();
  }

  const allMatches = [...data.recentMatches, ...data.upcomingMatches];
  const contentStatusMap = await getContentStatusMap(allMatches.map((match) => match.id));
  const emptyStatus = { hasPreview: false, hasRecap: false };

  return (
    <main className="min-h-screen bg-slate-50">
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
            <li className="text-[var(--color-ink)]">{data.team.name}</li>
          </ol>
        </nav>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <div className="flex items-center gap-4">
            <TeamBadge
              shortCode={
                data.team.shortCode ?? data.team.name.slice(0, 3).toUpperCase()
              }
              size={64}
              slug={data.team.slug}
            />
            <div className="min-w-0">
              <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
                {data.team.name}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {data.team.country || "Unknown"}
              </p>
            </div>
          </div>
        </section>

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

        {data.upcomingMatches.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              次戦
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {data.upcomingMatches.map((match) => (
                <MatchCard
                  contentStatus={contentStatusMap.get(match.id) ?? emptyStatus}
                  key={match.id}
                  match={toMatchCardItem(match)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
