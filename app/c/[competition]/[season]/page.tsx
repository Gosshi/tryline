import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";
import { SeasonSwitcher } from "@/components/season-switcher";
import { StandingsTable } from "@/components/standings-table";
import {
  getCompetitionBySlug,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
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

  const [matches, standings, seasons] = await Promise.all([
    listMatchesForCompetition(comp.slug),
    getStandingsForCompetition(comp.slug),
    listSeasonsByFamily(comp.family),
  ]);
  const groupedMatches = groupMatchesByRound(matches);
  const dateRange = formatDateRange(comp.startDate, comp.endDate);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <header className="space-y-3 border-b border-[var(--color-rule)] pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {comp.family.replace(/-/g, " ")}
          </p>
          <h1 className="font-serif text-4xl font-bold tracking-tight text-[var(--color-ink)] sm:text-5xl">
            {formatCompetitionTitle(comp.name, comp.season)}
          </h1>
          {dateRange && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {dateRange}
            </p>
          )}
        </header>

        <SeasonSwitcher
          competition={competition}
          currentSeason={comp.season}
          seasons={seasons}
        />

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
