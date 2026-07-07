import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import {
  getCompetitionBySlug,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import {
  getRoundMatches,
  listRoundHubParams,
  listRoundsForCompetition,
} from "@/lib/db/queries/matches";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import { formatRoundLabel } from "@/lib/format/round-label";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string; round: string; season: string }>;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const roundHubs = await listRoundHubParams();

  return roundHubs.map((hub) => ({
    competition: hub.competition,
    round: String(hub.round),
    season: hub.season,
  }));
}

function parseRoundParam(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const round = Number(value);

  return Number.isSafeInteger(round) ? round : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, round, season } = await params;
  const roundNumber = parseRoundParam(round);
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp || roundNumber === null) {
    return { title: "Tryline" };
  }

  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const roundLabel = formatRoundLabel(roundNumber, comp.family);
  const matches = await getRoundMatches(competition, season, roundNumber);
  const matchSummary = matches
    .slice(0, 3)
    .map((match) => `${match.homeTeam.name} vs ${match.awayTeam.name}`)
    .join("、");
  const description = `${competitionTitle} ${roundLabel}の全試合の結果・スコア・日本語レビュー。${matchSummary}。`;
  const url = `${SITE_URL}/c/${competition}/${season}/round/${roundNumber}`;

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      images: [{ height: 630, url: `${SITE_URL}/og-image.png`, width: 1200 }],
      locale: "ja_JP",
      title: `${competitionTitle} ${roundLabel} | Tryline`,
      type: "website",
      url,
    },
    title: {
      absolute: `${competitionTitle} ${roundLabel} 結果・日程 | Tryline`,
    },
  };
}

export default async function RoundHubPage({ params }: Props) {
  const { competition, round, season } = await params;
  const roundNumber = parseRoundParam(round);

  if (roundNumber === null) {
    notFound();
  }

  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    notFound();
  }

  const [matches, rounds, seasons] = await Promise.all([
    getRoundMatches(competition, season, roundNumber),
    listRoundsForCompetition(competition, season),
    listSeasonsByFamily(comp.family),
  ]);

  if (matches.length === 0 || !rounds.includes(roundNumber)) {
    notFound();
  }

  const contentStatusMap = await getContentStatusForMatches(
    matches.map((match) => match.id),
  );
  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const roundLabel = formatRoundLabel(roundNumber, comp.family);
  const pageUrl = `${SITE_URL}/c/${competition}/${season}/round/${roundNumber}`;
  const accentColor = getCompetitionFamilyColor(comp.family);
  const currentRoundIndex = rounds.indexOf(roundNumber);
  const previousRound =
    currentRoundIndex > 0 ? (rounds[currentRoundIndex - 1] ?? null) : null;
  const nextRound =
    currentRoundIndex >= 0 && currentRoundIndex < rounds.length - 1
      ? (rounds[currentRoundIndex + 1] ?? null)
      : null;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        item: SITE_URL,
        name: "Tryline",
        position: 1,
      },
      {
        "@type": "ListItem",
        item: `${SITE_URL}/c/${competition}`,
        name: formatFamilyName(comp.family),
        position: 2,
      },
      {
        "@type": "ListItem",
        item: `${SITE_URL}/c/${competition}/${season}`,
        name: competitionTitle,
        position: 3,
      },
      {
        "@type": "ListItem",
        item: pageUrl,
        name: roundLabel,
        position: 4,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-paper">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <nav className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
          <Link className="hover:text-[var(--color-ink)]" href="/">
            Tryline
          </Link>
          <span>/</span>
          <Link
            className="hover:text-[var(--color-ink)]"
            href={`/c/${competition}`}
          >
            {formatFamilyName(comp.family)}
          </Link>
          <span>/</span>
          <Link
            className="hover:text-[var(--color-ink)]"
            href={`/c/${competition}/${season}`}
          >
            {comp.season}
          </Link>
          <span>/</span>
          <span className="text-[var(--color-ink)]">{roundLabel}</span>
        </nav>

        <header
          className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
          style={{ borderLeft: `4px solid ${accentColor}` }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: accentColor }}
          >
            {formatFamilyName(comp.family)}
          </p>
          <h1 className="mt-1 font-heading text-4xl font-bold tracking-tight text-[var(--color-ink)] sm:text-5xl">
            {competitionTitle} {roundLabel} の結果・日程
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            {matches.length}試合をキックオフ順に掲載しています。
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {matches.map((match) => (
            <MatchCard
              contentStatus={
                contentStatusMap[match.id] ?? {
                  hasPreview: false,
                  hasRecap: false,
                }
              }
              key={match.id}
              match={match}
            />
          ))}
        </section>

        <nav
          aria-label="前後のラウンド"
          className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            {previousRound !== null && (
              <Link
                className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href={`/c/${competition}/${season}/round/${previousRound}`}
              >
                ← {formatRoundLabel(previousRound, comp.family)}
              </Link>
            )}
          </div>
          <Link
            className="inline-flex justify-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/c/${competition}/${season}`}
          >
            シーズン全体を見る →
          </Link>
          <div className="text-right">
            {nextRound !== null && (
              <Link
                className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                href={`/c/${competition}/${season}/round/${nextRound}`}
              >
                {formatRoundLabel(nextRound, comp.family)} →
              </Link>
            )}
          </div>
        </nav>

        {seasons.length > 1 && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            他シーズンの一覧は大会ページから確認できます。
          </p>
        )}
      </div>
    </main>
  );
}
