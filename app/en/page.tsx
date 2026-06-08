import { MatchCard } from "@/components/match-card";
import {
  getRecentLeagueOneEnglishRecaps,
  getUpcomingMatches,
} from "@/lib/db/queries/matches";

import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  description:
    "Match previews & recaps for Japan Rugby League One, in English.",
  title: "Japan Rugby League One — Tryline",
};

export default async function EnglishLandingPage() {
  const [allUpcomingMatches, recentRecaps] = await Promise.all([
    getUpcomingMatches(10),
    getRecentLeagueOneEnglishRecaps(5),
  ]);
  const upcomingMatches = allUpcomingMatches.filter(
    (match) => match.competition.family === "league-one",
  );
  const hasContent = upcomingMatches.length > 0 || recentRecaps.length > 0;

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b border-slate-200 bg-[var(--color-ink)]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Tryline English
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
            Japan Rugby League One
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70">
            Match previews and recaps for Japan Rugby League One,
            written in English for fans following the competition from abroad.
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 md:px-8">
        {upcomingMatches.length > 0 && (
          <section aria-labelledby="upcoming-heading" className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                League One
              </p>
              <h2
                className="mt-1 font-serif text-3xl font-bold text-[var(--color-ink)]"
                id="upcoming-heading"
              >
                Upcoming
              </h2>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {upcomingMatches.map((match) => (
                <li key={match.id}>
                  <MatchCard href={`/matches/${match.id}/en`} match={match} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {recentRecaps.length > 0 && (
          <section aria-labelledby="recent-heading" className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                English recaps
              </p>
              <h2
                className="mt-1 font-serif text-3xl font-bold text-[var(--color-ink)]"
                id="recent-heading"
              >
                Recent Results
              </h2>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {recentRecaps.map((match) => (
                <li key={match.id}>
                  <MatchCard href={`/matches/${match.id}/en`} match={match} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!hasContent && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-medium text-[var(--color-ink-muted)]">
              No content yet. Check back soon.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
