import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getMatchesForPlayer,
  getPlayerBySlug,
} from "@/lib/db/queries/players";
import { formatCompetitionTitle } from "@/lib/format/competition";

import type { PlayerMatchRow } from "@/lib/db/queries/players";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 3600;

function formatDate(value: string): string {
  if (!value) {
    return "日程未定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatScore(match: PlayerMatchRow): string {
  if (
    match.status !== "finished" ||
    match.homeScore === null ||
    match.awayScore === null
  ) {
    return "予定";
  }

  return `${match.homeScore}-${match.awayScore}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);

  if (!player || player.canonicalSlug) {
    return { title: "Tryline" };
  }

  return {
    description: `${player.name}（${player.teamName}）の出場試合・スタッツ一覧。`,
    title: `${player.name} — ${player.teamName}`,
  };
}

export default async function PlayerPage({ params }: Props) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);

  if (!player) {
    notFound();
  }

  if (player.canonicalSlug) {
    redirect(`/players/${player.canonicalSlug}`);
  }

  const matches = await getMatchesForPlayer(player.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
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
            <li className="text-[var(--color-ink)]">{player.name}</li>
          </ol>
        </nav>

        <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Player
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            {player.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-ink-muted)]">
            {player.position && <span>{player.position}</span>}
            {player.position && <span aria-hidden>·</span>}
            {player.teamSlug ? (
              <Link
                className="font-medium text-[var(--color-ink)] underline decoration-slate-300 underline-offset-4 transition-colors hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href={`/teams/${player.teamSlug}`}
              >
                {player.teamName}
              </Link>
            ) : (
              <span>{player.teamName}</span>
            )}
          </div>
        </header>

        <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              出場試合
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              直近30件のラインアップ登録試合
            </p>
          </div>

          {matches.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              出場試合データがありません
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
              {matches.map((match) => (
                <Link
                  className="grid gap-2 border-b border-slate-100 px-4 py-4 text-sm transition-colors last:border-b-0 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:grid-cols-[7rem_minmax(0,1fr)_5rem_5rem] sm:items-center sm:gap-4"
                  href={`/matches/${match.matchId}`}
                  key={`${match.matchId}-${match.jerseyNumber}`}
                >
                  <time
                    className="font-medium text-[var(--color-ink-muted)]"
                    dateTime={match.kickoffAt || undefined}
                  >
                    {formatDate(match.kickoffAt)}
                  </time>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--color-ink)]">
                      {match.homeTeamName} vs {match.awayTeamName}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">
                      {formatCompetitionTitle(
                        match.competitionName,
                        match.competitionSeason,
                      )}
                    </p>
                  </div>
                  <div className="font-semibold text-[var(--color-ink)] sm:text-center">
                    {formatScore(match)}
                  </div>
                  <div className="text-xs font-medium text-[var(--color-ink-muted)] sm:text-right">
                    #{match.jerseyNumber}{" "}
                    {match.isStarter ? "先発" : "途中出場"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
