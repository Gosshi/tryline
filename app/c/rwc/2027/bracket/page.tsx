import Link from "next/link";

import { KnockoutBracket } from "@/components/knockout-bracket";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";

import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Rugby World Cup 2027 ブラケット",
  description: "RWC 2027 ノックアウトステージの対戦表。",
};

function PendingState() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        Bracket
      </p>
      <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-[var(--color-ink)]">
        Rugby World Cup 2027
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        ノックアウトステージの対戦表を準備中です。
      </p>
    </div>
  );
}

export default async function Rwc2027BracketPage() {
  const competition = await getCompetitionBySlug("rwc-2027");

  if (!competition) {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
          <PendingState />
        </div>
      </main>
    );
  }

  const matches = (await listMatchesForCompetition("rwc-2027")).filter(
    (match) => match.round !== null && match.round >= 5,
  );

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Knockout
            </p>
            <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
              Rugby World Cup 2027
            </h1>
          </div>
          <Link
            className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
            href="/c/rwc/2027"
          >
            大会ページへ戻る
          </Link>
        </div>

        {matches.length === 0 ? <PendingState /> : <KnockoutBracket matches={matches} />}
      </div>
    </main>
  );
}
