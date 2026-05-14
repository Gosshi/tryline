import { notFound } from "next/navigation";

import { FlagIcon } from "@/components/flag-icon";
import { MatchCard } from "@/components/match-card";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import {
  getMatchesByTeamSlug,
  getTeamBySlug,
} from "@/lib/db/queries/matches";
import { getTeamColor } from "@/lib/format/team-identity";
import { createOgImage } from "@/lib/seo/og-image";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ team: string }>;
};

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team } = await params;
  const teamData = await getTeamBySlug(team);

  if (!teamData) {
    return { title: "Tryline" };
  }

  const title = `${teamData.name} — 試合一覧`;
  const description = `${teamData.name} の試合結果・今後の試合・AI日本語レビュー。`;

  return {
    description,
    openGraph: {
      description: `${teamData.name} の試合一覧。`,
      images: [
        createOgImage({
          competition: "Team",
          home: teamData.name,
        }),
      ],
      title: `${teamData.name} | Tryline`,
      type: "website",
      url: `https://tryline-six.vercel.app/t/${team}`,
    },
    title,
  };
}

export default async function TeamPage({ params }: Props) {
  const { team } = await params;
  const [teamData, matches] = await Promise.all([
    getTeamBySlug(team),
    getMatchesByTeamSlug(team),
  ]);

  if (!teamData) {
    notFound();
  }

  const allMatches = [...matches.upcoming, ...matches.past];
  const contentStatusMap = await getContentStatusMap(
    allMatches.map((match) => match.id),
  );
  const teamColor = getTeamColor(team);
  const emptyStatus = { hasPreview: false, hasRecap: false };

  return (
    <main className="min-h-screen bg-slate-50">
      <header
        className="border-b border-[var(--color-rule)] bg-white"
        style={{ borderTop: `4px solid ${teamColor}` }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-7 sm:px-6 md:px-8">
          <FlagIcon size={44} slug={team} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Team
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
              {teamData.name}
            </h1>
            <p className="mt-1 text-sm font-medium text-[var(--color-ink-muted)]">
              {teamData.shortCode}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        {matches.upcoming.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              今後の試合
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {matches.upcoming.map((match) => (
                <MatchCard
                  contentStatus={contentStatusMap.get(match.id) ?? emptyStatus}
                  key={match.id}
                  match={match}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            過去の試合
          </h2>
          {matches.past.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              試合データがありません
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matches.past.map((match) => (
                <MatchCard
                  contentStatus={contentStatusMap.get(match.id) ?? emptyStatus}
                  key={match.id}
                  match={match}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
