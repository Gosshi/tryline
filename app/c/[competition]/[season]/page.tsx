import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { CompetitionViewingGuide } from "@/components/competition-viewing-guide";
import { PremiumUpsellBanner } from "@/components/premium-upsell-banner";
import { SeasonMatchGroups } from "@/components/season-match-groups";
import { SeasonSwitcher } from "@/components/season-switcher";
import { StandingsTable } from "@/components/standings-table";
import {
  getCompetitionBySlug,
  getCompetitionGuide,
  listFamilies,
  listSeasonsByFamily,
} from "@/lib/db/queries/competitions";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import {
  getPoolStandingsForCompetition,
  getStandingsForCompetition,
} from "@/lib/db/queries/standings";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { groupMatchesByRound } from "@/lib/format/match-groups";
import { createCompetitionOgImage } from "@/lib/seo/og-image";
import { SITE_URL } from "@/lib/site";

import type { MatchListItem } from "@/lib/db/queries/matches";
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

function formatMatchKickoffJst(kickoffAt: string): string {
  return `${formatKickoffJstDate(kickoffAt)} ${formatKickoffJstTime(kickoffAt)}`;
}

function findNextScheduledMatch(
  matches: MatchListItem[],
  now = new Date(),
): MatchListItem | null {
  const nowTime = now.getTime();

  return (
    matches
      .filter(
        (match) =>
          match.status === "scheduled" &&
          new Date(match.kickoffAt).getTime() >= nowTime,
      )
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0] ?? null
  );
}

function isJapanMatch(match: MatchListItem): boolean {
  return match.homeTeam.slug === "japan" || match.awayTeam.slug === "japan";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    return { title: "Tryline" };
  }

  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const title = `${competitionTitle} 順位表・試合結果・日本語レビュー`;
  const description = `${competitionTitle} の順位表・日程・試合結果・日本語レビューと、日本での視聴方法を掲載。`;

  return {
    alternates: { canonical: `${SITE_URL}/c/${competition}/${season}` },
    description,
    openGraph: {
      description,
      images: [
        createCompetitionOgImage({
          accentColor: getCompetitionFamilyColor(comp.family),
          familyName: formatFamilyName(comp.family),
          season: comp.season,
        }),
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

  const [matches, standings, poolStandings, seasons, guide] = await Promise.all([
    listMatchesForCompetition(comp.slug),
    getStandingsForCompetition(comp.slug),
    getPoolStandingsForCompetition(comp.slug),
    listSeasonsByFamily(comp.family),
    getCompetitionGuide(comp.family),
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
  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const familyTitle = formatFamilyName(family);
  const nextMatch = findNextScheduledMatch(matches);
  const nextJapanMatch = findNextScheduledMatch(matches.filter(isJapanMatch));
  const nextMatchJst = nextMatch
    ? formatMatchKickoffJst(nextMatch.kickoffAt)
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
        name: familyTitle,
        position: 2,
      },
      {
        "@type": "ListItem",
        item: pageUrl,
        name: competitionTitle,
        position: 3,
      },
    ],
  };
  const seasonFaqs = [
    {
      answer: `${competitionTitle}は${dateRange ?? "開催期間未定"}に開催されます。`,
      question: `${competitionTitle}はいつ開催されますか？`,
    },
    {
      answer: "日本ではDAZN・J SPORTS 等の配信サービスで視聴できます。",
      question: `${familyTitle}はどこで見られますか？`,
    },
    {
      answer: nextMatchJst
        ? `次の試合は${nextMatchJst}（日本時間）です。`
        : "現在予定されている試合はありません。",
      question: `${familyTitle}の次の試合はいつですか（日本時間）？`,
    },
    {
      answer:
        standings.length > 0
          ? "このページ上部の順位表で最新順位を確認できます。"
          : "このシーズンの順位表はまだ確定していません。",
      question: `${familyTitle}の順位表はどこで見られますか？`,
    },
  ];
  const seasonFaqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: seasonFaqs.map((faq) => ({
      "@type": "Question",
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
      name: faq.question,
    })),
  };

  return (
    <main className="min-h-screen bg-paper">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(seasonFaqJsonLd),
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
            {formatCompetitionTitle(comp, comp.season)}
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

        <div className="space-y-4" id="standings">
          {poolStandings.length > 0
            ? poolStandings.map((pool) => (
                <StandingsTable
                  key={pool.poolName}
                  standings={pool.standings}
                  title={pool.poolName}
                />
              ))
            : <StandingsTable standings={standings} />}
        </div>

        {nextJapanMatch && (
          <Link
            className="block rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-5 transition-colors hover:border-[var(--color-accent)]/60"
            href={`/matches/${nextJapanMatch.id}`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              日本代表の次戦
            </p>
            <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">
              {nextJapanMatch.homeTeam.name} 対 {nextJapanMatch.awayTeam.name}
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {formatMatchKickoffJst(nextJapanMatch.kickoffAt)}
            </p>
          </Link>
        )}

        {matches.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-rule)] bg-[#f8fafc] px-6 py-10 text-center">
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
                roundHubBasePath={`/c/${competition}/${season}`}
              />
            </Suspense>
          </>
        )}

        <div className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <CompetitionViewingGuide
            markdown={guide?.guideJa ?? null}
            sourceUrl={guide?.sourceUrl ?? null}
            verifiedAt={guide?.verifiedAt ?? null}
          />
        </div>
      </div>
    </main>
  );
}
