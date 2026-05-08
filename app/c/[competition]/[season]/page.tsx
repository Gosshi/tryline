import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";
import { SeasonSwitcher } from "@/components/season-switcher";
import { StandingsTable } from "@/components/standings-table";
import {
  getCompetitionBySlug,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import { getStandingsForCompetition } from "@/lib/db/queries/standings";
import {
  formatCompetitionTitle,
  formatFamilyName,
} from "@/lib/format/competition";

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

  const title = formatCompetitionTitle(comp.name, comp.season);
  const description = `${title} の試合結果・順位表・AI日本語レビュー一覧。`;

  return {
    description,
    openGraph: {
      description,
      title: `${title} | Tryline`,
      type: "website",
      url: `https://tryline-six.vercel.app/c/${competition}/${season}`,
    },
    title,
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
  const contentStatusMap = await getContentStatusMap(
    matches.map((match) => match.id),
  );
  const groupedMatches = groupMatchesByRound(matches);
  const dateRange = formatDateRange(comp.startDate, comp.endDate);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <header className="space-y-3 border-b border-[var(--color-rule)] pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {formatFamilyName(comp.family)}
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-[var(--color-ink)] sm:text-5xl">
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
          <div className="rounded-lg border border-[var(--color-rule)] bg-slate-50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-[var(--color-ink)]">
              試合データを準備中です
            </p>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
              このシーズンの試合情報はまもなく公開予定です。
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
                href={`/c/${competition}`}
              >
                他のシーズンを見る
              </Link>
              <span className="hidden text-[var(--color-ink-muted)] sm:inline">
                ·
              </span>
              <Link
                className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
                href="/"
              >
                トップへ戻る
              </Link>
            </div>
          </div>
        ) : (
          groupedMatches.map(([round, roundMatches]) => (
            <section className="space-y-4" key={round ?? "unassigned"}>
              <RoundHeading round={round} />
              <div className="grid gap-4 md:grid-cols-2">
                {roundMatches.map((match) => (
                  <MatchCard
                    contentStatus={
                      contentStatusMap.get(match.id) ?? {
                        hasPreview: false,
                        hasRecap: false,
                      }
                    }
                    key={match.id}
                    match={match}
                  />
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
