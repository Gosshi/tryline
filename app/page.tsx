import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";
import {
  getLatestCompetitionWithMatches,
  listMatchesForCompetition,
} from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";

import type { Metadata } from "next";

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

export async function generateMetadata(): Promise<Metadata> {
  const competition = await getLatestCompetitionWithMatches();

  if (!competition) {
    return { title: "Tryline" };
  }

  return {
    title: `${formatCompetitionTitle(competition.name, competition.season)} - Tryline`,
  };
}

export default async function HomePage() {
  const competition = await getLatestCompetitionWithMatches();

  if (!competition) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:px-8">
          <p className="text-sm text-slate-500">
            現在表示できる試合はありません
          </p>
        </div>
      </main>
    );
  }

  const matches = await listMatchesForCompetition(competition.slug);
  const groupedMatches = groupMatchesByRound(matches);
  const dateRange = formatDateRange(competition.startDate, competition.endDate);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <header className="space-y-3 border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            {formatCompetitionTitle(competition.name, competition.season)}
          </h1>
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
      </div>
    </main>
  );
}
