import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { PremiumUpsellBanner } from "@/components/premium-upsell-banner";
import { SeasonMatchGroups } from "@/components/season-match-groups";
import { SeasonSwitcher } from "@/components/season-switcher";
import { StandingsTable } from "@/components/standings-table";
import {
  getCompetitionBySlug,
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import { getStandingsForCompetition } from "@/lib/db/queries/standings";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import { groupMatchesByRound } from "@/lib/format/match-groups";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string; season: string }>;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const families = await listFamilies();
  const params = (
    await Promise.all(
      families.map(async (competition) => {
        const seasons = await listSeasonsByFamily(competition);

        return seasons.map((season) => ({
          competition,
          season: season.season,
        }));
      }),
    )
  ).flat();

  return params;
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
    alternates: { canonical: `${SITE_URL}/c/${competition}/${season}` },
    description,
    openGraph: {
      description,
      images: [
        {
          height: 630,
          url: `${SITE_URL}/og-image.png`,
          width: 1200,
        },
      ],
      title: `${title} | Tryline`,
      type: "website",
      url: `${SITE_URL}/c/${competition}/${season}`,
    },
    title,
  };
}

export default async function SeasonPage({ params }: Props) {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    const available = await listSeasonsByFamily(competition);
    const latest = available[0];

    if (latest) {
      redirect(`/c/${competition}/${latest.season}`);
    }

    notFound();
  }

  const [matches, standings, seasons] = await Promise.all([
    listMatchesForCompetition(comp.slug),
    getStandingsForCompetition(comp.slug),
    listSeasonsByFamily(comp.family),
  ]);
  const contentStatusMap = await getContentStatusForMatches(
    matches.map((match) => match.id),
  );
  const hasAnyContent = Object.values(contentStatusMap).some(
    (status) => status.hasPreview || status.hasRecap,
  );
  const groupedMatches = groupMatchesByRound(matches);
  const dateRange = formatDateRange(comp.startDate, comp.endDate);
  const family = comp.family;
  const accentColor = getCompetitionFamilyColor(family);
  const pageUrl = `${SITE_URL}/c/${competition}/${season}`;
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
        item: pageUrl,
        name: formatCompetitionTitle(comp.name, comp.season),
        position: 3,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <header
          className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
          style={{ borderLeft: `4px solid ${accentColor}` }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: accentColor }}
          >
            {formatFamilyName(family)}
          </p>
          <h1 className="mt-1 font-heading text-4xl font-bold tracking-tight text-[var(--color-ink)] sm:text-5xl">
            {formatCompetitionTitle(comp.name, comp.season)}
          </h1>
          {dateRange && (
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              {dateRange}
            </p>
          )}
        </header>

        <SeasonSwitcher
          competition={competition}
          currentSeason={comp.season}
          seasons={seasons}
        />

        {family === "league-one" && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            🌐 English match reviews available — select a match to read in
            English
          </p>
        )}

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
          <>
            {hasAnyContent && <PremiumUpsellBanner />}
            <Suspense>
              <SeasonMatchGroups
                contentStatusMap={contentStatusMap}
                family={family}
                groupedMatches={groupedMatches}
              />
            </Suspense>
          </>
        )}

        <div id="standings">
          <StandingsTable standings={standings} />
        </div>
      </div>
    </main>
  );
}