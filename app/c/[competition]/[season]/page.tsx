import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";
import { StandingsTable } from "@/components/standings-table";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import { getStandingsForCompetition } from "@/lib/db/queries/standings";
import { formatCompetitionTitle } from "@/lib/format/competition";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string; season: string }>;
};

export const revalidate = 60;

function groupMatchesByRound(
  matches: Awaited<ReturnType<typeof listMatchesForCompetition>>,
) {
  const grouped = new Map<number | null, typeof matches>();

  for (const match of matches) {
    const current = grouped.get(match.round) ?? [];
    current.push(match);
    grouped.set(match.round, current);
  }

  return [...grouped.entries()].sort(([leftRound], [rightRound]) => {
    if (leftRound === null) {
      return 1;
    }

    if (rightRound === null) {
      return -1;
    }

    return leftRound - rightRound;
  });
}

function formatDateJa(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (!startDate && !endDate) {
    return null;
  }

  return [startDate, endDate]
    .filter((date): date is string => date !== null)
    .map(formatDateJa)
    .join(" 〜 ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    return { title: "Tryline" };
  }

  return {
    title: `${formatCompetitionTitle(comp.name, comp.season)} - Tryline`,
  };
}

export default async function SeasonPage({ params }: Props) {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    notFound();
  }

  const [matches, standings] = await Promise.all([
    listMatchesForCompetition(comp.slug),
    getStandingsForCompetition(comp.slug),
  ]);
  const groupedMatches = groupMatchesByRound(matches);
  const dateRange = formatDateRange(comp.startDate, comp.endDate);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <section className="border-b border-slate-200 bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-600">
              AI Rugby Analysis in Japanese
            </p>
            <h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
              海外ラグビーを、日本語で深掘り。
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600">
              Six Nations をはじめとする世界のラグビーリーグを、AI
              が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
            </p>
          </div>
        </section>

        <header className="space-y-3 border-b border-slate-200 pb-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {formatCompetitionTitle(comp.name, comp.season)}
          </h2>
          {dateRange && <p className="text-sm text-slate-500">{dateRange}</p>}
        </header>

        {matches.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            試合が登録されていません
          </p>
        ) : (
          groupedMatches.map(([round, roundMatches]) => (
            <section className="space-y-4" key={round ?? "unassigned"}>
              <RoundHeading round={round} />
              <div className="grid gap-4 md:grid-cols-2">
                {roundMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))
        )}

        <div id="standings">
          <StandingsTable standings={standings} />
        </div>
      </div>
    </main>
  );
}
