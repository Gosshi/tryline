import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Six Nations 2027 - Tryline",
};

export const revalidate = 60;

const COMPETITION_SLUG = "six-nations-2027";

function groupMatchesByRound(matches: Awaited<ReturnType<typeof listMatchesForCompetition>>) {
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

export default async function HomePage() {
  const matches = await listMatchesForCompetition(COMPETITION_SLUG);
  const groupedMatches = groupMatchesByRound(matches);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_100%)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-8">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">Tryline</p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Six Nations 2027
            </h1>
            <p className="text-sm text-slate-600 sm:text-base">2027-02-06 〜 2027-03-20</p>
          </div>
        </header>

        {matches.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
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
