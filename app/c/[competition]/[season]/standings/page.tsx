import Link from "next/link";
import { notFound } from "next/navigation";

import { StandingsTable } from "@/components/standings-table";
import { TrackedLink } from "@/components/tracked-link";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import {
  getPoolStandingsForCompetition,
  getStandingsForCompetition,
  getStandingsUpdatedAtForCompetition,
  listStandingsPageParams,
} from "@/lib/db/queries/standings";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string; season: string }>;
};

export const revalidate = 900;

export async function generateStaticParams() {
  const pages = await listStandingsPageParams();

  return pages.map(({ competition, season }) => ({ competition, season }));
}

function formatUpdatedAt(updatedAt: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(updatedAt));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    return { title: "Tryline" };
  }

  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const title = `${competitionTitle} 順位表`;
  const description = `${competitionTitle}の最新順位表。勝点・勝敗・得失点を確認できます。`;
  const url = `${SITE_URL}/c/${competition}/${season}/standings`;

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      images: [{ height: 630, url: `${SITE_URL}/og-image.png`, width: 1200 }],
      locale: "ja_JP",
      title: `${title} | Tryline`,
      type: "website",
      url,
    },
    title: { absolute: `${title} | Tryline` },
  };
}

export default async function CompetitionStandingsPage({ params }: Props) {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    notFound();
  }

  const [standings, poolStandings, updatedAt] = await Promise.all([
    getStandingsForCompetition(comp.slug),
    getPoolStandingsForCompetition(comp.slug),
    getStandingsUpdatedAtForCompetition(comp.slug),
  ]);
  const hasStandings =
    standings.length > 0 ||
    poolStandings.some((pool) => pool.standings.length > 0);

  if (!hasStandings) {
    notFound();
  }

  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const pageUrl = `${SITE_URL}/c/${competition}/${season}/standings`;
  const accentColor = getCompetitionFamilyColor(comp.family);
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
        name: "順位表",
        position: 4,
      },
    ],
  };

  return (
    <main className="bg-paper min-h-screen">
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
          <span className="text-[var(--color-ink)]">順位表</span>
        </nav>

        <header
          className="flex flex-col gap-2 border-b-2 pb-4 sm:flex-row sm:items-end sm:justify-between"
          style={{ borderColor: accentColor }}
        >
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: accentColor }}
            >
              {formatFamilyName(comp.family)}
            </p>
            <h1 className="mt-1 font-heading text-xl font-bold tracking-tight text-[var(--color-ink)] sm:text-2xl">
              {competitionTitle} 順位表
            </h1>
          </div>
          {updatedAt && (
            <p className="text-xs text-[var(--color-ink-muted)] sm:text-right">
              最終更新: {formatUpdatedAt(updatedAt)}
            </p>
          )}
        </header>

        <section
          aria-label={`${competitionTitle}の順位表`}
          className="space-y-4"
        >
          {poolStandings.length > 0 ? (
            poolStandings.map((pool) => (
              <StandingsTable
                accentColor={accentColor}
                key={pool.poolName}
                standings={pool.standings}
                title={`${pool.poolName} 順位表`}
              />
            ))
          ) : (
            <StandingsTable accentColor={accentColor} standings={standings} />
          )}
        </section>

        <nav
          aria-label="大会ページへの導線"
          className="flex flex-wrap gap-3 border-t border-slate-200 pt-6"
        >
          <Link
            className="inline-flex rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/c/${competition}/${season}`}
          >
            大会ハブへ戻る
          </Link>
          <Link
            className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/c/${competition}/${season}#schedule`}
          >
            日程・結果を見る
          </Link>
          <TrackedLink
            analytics={{
              cta_id: "standings_calendar",
              cta_location: "standings_page",
              destination: "calendar",
              label: "今週の全試合を見る",
            }}
            className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href="/calendar"
          >
            今週の全試合を見る →
          </TrackedLink>
        </nav>
      </div>
    </main>
  );
}
