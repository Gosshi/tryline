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
  formatPoolName,
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
    <main className="tl-scope tl-standings-page bg-paper min-h-screen">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <header className="tl-standings-band tl-season-band relative overflow-hidden">
        <span
          className="tl-band-art pointer-events-none absolute inset-0"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-[#dedbd4]">
            <Link className="hover:text-white" href="/">
              Tryline
            </Link>
            <span>/</span>
            <Link className="hover:text-white" href={`/c/${competition}`}>
              {formatFamilyName(comp.family)}
            </Link>
            <span>/</span>
            <Link
              className="hover:text-white"
              href={`/c/${competition}/${season}`}
            >
              {comp.season}
            </Link>
            <span>/</span>
            <span className="text-white">順位表</span>
          </nav>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ddba87]">
                {formatFamilyName(comp.family)}
              </p>
              <h1 className="mt-2 font-heading text-[28px] font-extrabold leading-snug tracking-tight text-white sm:text-[40px]">
                {competitionTitle} 順位表
              </h1>
            </div>
            {updatedAt && (
              <p className="tl-standings-updated text-xs leading-6 text-[#dedbd4]">
                最終更新: {formatUpdatedAt(updatedAt)}
              </p>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 sm:px-6 md:px-8">
        <nav
          aria-label="大会ページへの導線"
          className="tl-standings-nav flex flex-wrap gap-x-6"
        >
          <span
            aria-current="page"
            className="inline-flex min-h-11 items-center border-b-2 border-[var(--color-ink)] py-2 text-sm font-bold text-[var(--color-ink)]"
          >
            順位表
          </span>
          <Link
            className="inline-flex min-h-11 items-center border-b-2 border-transparent py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/c/${competition}/${season}`}
          >
            大会ハブへ戻る
          </Link>
          <Link
            className="inline-flex min-h-11 items-center border-b-2 border-transparent py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
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
            className="inline-flex min-h-11 items-center border-b-2 border-transparent py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href="/calendar"
          >
            今週の全試合を見る →
          </TrackedLink>
        </nav>
        <section
          aria-label={`${competitionTitle}の順位表`}
          className="tl-standings-sheet space-y-6"
        >
          {poolStandings.length > 0 ? (
            poolStandings.map((pool) => (
              <StandingsTable
                accentColor={accentColor}
                key={pool.poolName}
                standings={pool.standings}
                title={`${formatPoolName(pool.poolName)} 順位表`}
              />
            ))
          ) : (
            <StandingsTable accentColor={accentColor} standings={standings} />
          )}
        </section>
      </div>
    </main>
  );
}
