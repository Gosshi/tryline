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
import { getMatchBroadcastPresenceForMatches } from "@/lib/db/queries/match-broadcasts";
import { getContentStatusForMatches } from "@/lib/db/queries/match-content";
import {
  getNextMatchForTeamSlug,
  listMatchesForCompetition,
} from "@/lib/db/queries/matches";
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
import type { StandingRow } from "@/lib/db/queries/standings";
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

function getWebcalUrl(url: string): string {
  return url.replace(/^https?:/, "webcal:");
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

function getMatchLabel(match: MatchListItem): string {
  return `${match.homeTeam.name} 対 ${match.awayTeam.name}`;
}

type CompetitionHubState = "active" | "information" | "post" | "pre";

function getCompetitionHubState(matches: MatchListItem[]): CompetitionHubState {
  const activeMatches = matches.filter((match) => match.status !== "cancelled");

  if (activeMatches.length === 0) {
    return "information";
  }

  if (activeMatches.every((match) => match.status === "scheduled")) {
    return "pre";
  }

  if (activeMatches.every((match) => match.status === "finished")) {
    return "post";
  }

  return "active";
}

function getCompetitionHubMetadataCopy({
  hasBroadcasts,
  hasRecap,
  hasStandings,
  state,
}: {
  hasBroadcasts: boolean;
  hasRecap: boolean;
  hasStandings: boolean;
  state: CompetitionHubState;
}): { description: string; title: string } {
  switch (state) {
    case "information":
      return {
        description: "大会情報・見どころを掲載。",
        title: "大会情報・見どころ",
      };
    case "pre":
      return hasBroadcasts
        ? {
            description: "日程・放送予定・見どころを掲載。",
            title: "日程・放送予定・見どころ",
          }
        : {
            description: "日程・見どころを掲載。",
            title: "日程・見どころ",
          };
    case "post":
      return hasRecap
        ? {
            description: "全試合結果と日本語レビューを掲載。",
            title: "全試合結果・日本語レビュー",
          }
        : {
            description: "全試合結果を掲載。",
            title: "全試合結果",
          };
    case "active":
      return hasStandings
        ? {
            description: "最新結果・次戦・日程・順位を掲載。",
            title: "最新結果・次戦・日程・順位",
          }
        : {
            description: "最新結果・次戦・日程を掲載。",
            title: "最新結果・次戦・日程",
          };
  }
}

function selectStandingsExcerpt<
  T extends { teamName: string; teamShortCode: string },
>(standings: T[], includeJapan: boolean): T[] {
  const excerpt = new Map<string, T>();

  for (const row of standings.slice(0, 3)) {
    excerpt.set(row.teamName, row);
  }

  if (includeJapan) {
    for (const row of standings) {
      if (
        row.teamShortCode.toLowerCase() === "jpn" ||
        row.teamName.toLowerCase() === "japan" ||
        row.teamName === "日本"
      ) {
        excerpt.set(row.teamName, row);
      }
    }
  }

  return [...excerpt.values()].sort((left, right) => {
    const leftIndex = standings.indexOf(left);
    const rightIndex = standings.indexOf(right);

    return leftIndex - rightIndex;
  });
}

function SeasonSummaryBand({
  leaderLabel,
  latestReviewMatch,
  nextJapanCompetitionLabel,
  nextJapanMatch,
  nextMatch,
}: {
  leaderLabel: string | null;
  latestReviewMatch: MatchListItem | null;
  nextJapanCompetitionLabel: string | null;
  nextJapanMatch: MatchListItem | null;
  nextMatch: MatchListItem | null;
}) {
  const items = [
    nextMatch
      ? {
          href: `/matches/${nextMatch.id}`,
          label: "次戦",
          primary: getMatchLabel(nextMatch),
          secondary: formatMatchKickoffJst(nextMatch.kickoffAt),
        }
      : null,
    leaderLabel
      ? {
          href: null,
          label: "首位",
          primary: leaderLabel,
          secondary: "最新順位表より",
        }
      : null,
    latestReviewMatch
      ? {
          href: `/matches/${latestReviewMatch.id}`,
          label: "最新レビュー",
          primary: getMatchLabel(latestReviewMatch),
          secondary: formatMatchKickoffJst(latestReviewMatch.kickoffAt),
        }
      : null,
    nextJapanMatch
      ? {
          href: `/matches/${nextJapanMatch.id}`,
          label: "日本代表の次戦",
          primary: getMatchLabel(nextJapanMatch),
          secondary: [
            formatMatchKickoffJst(nextJapanMatch.kickoffAt),
            nextJapanCompetitionLabel,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="シーズン要約"
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
    >
      {items.map((item) => {
        const content = (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
              {item.label}
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--color-ink)]">
              {item.primary}
            </p>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              {item.secondary}
            </p>
          </>
        );

        return item.href ? (
          <Link
            className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-white"
            href={item.href}
            key={item.label}
          >
            {content}
          </Link>
        ) : (
          <div
            className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
            key={item.label}
          >
            {content}
          </div>
        );
      })}
    </section>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition, season } = await params;
  const comp = await getCompetitionBySlug(`${competition}-${season}`);

  if (!comp) {
    return { title: "Tryline" };
  }

  const [matches, standings] = await Promise.all([
    listMatchesForCompetition(comp.slug),
    getStandingsForCompetition(comp.slug),
  ]);
  const matchIds = matches.map((match) => match.id);
  const [broadcastMatchIds, contentStatusMap] = await Promise.all([
    getMatchBroadcastPresenceForMatches(matchIds),
    getContentStatusForMatches(matchIds),
  ]);
  const metadataCopy = getCompetitionHubMetadataCopy({
    hasBroadcasts: broadcastMatchIds.size > 0,
    hasRecap: Object.values(contentStatusMap).some((status) => status.hasRecap),
    hasStandings: standings.length > 0,
    state: getCompetitionHubState(matches),
  });
  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const title = `${competitionTitle} ${metadataCopy.title}`;
  const competitionDescriptionTitle =
    comp.family === "six-nations"
      ? `${competitionTitle}（6カ国対抗）`
      : competitionTitle;
  const description = `${competitionDescriptionTitle} の${metadataCopy.description}`;

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

  const [matches, standings, poolStandings, seasons, guide] = await Promise.all(
    [
      listMatchesForCompetition(comp.slug),
      getStandingsForCompetition(comp.slug),
      getPoolStandingsForCompetition(comp.slug),
      listSeasonsByFamily(comp.family),
      getCompetitionGuide(comp.family),
    ],
  );
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
  const competitionCalendarFeedUrl = `${SITE_URL}/api/calendar/${comp.slug}.ics`;
  const competitionTitle = formatCompetitionTitle(comp, comp.season);
  const familyTitle = formatFamilyName(family);
  const nextMatch = findNextScheduledMatch(matches);
  const hasJapanInSeason = matches.some(isJapanMatch);
  const nextJapanMatchInSeason = findNextScheduledMatch(
    matches.filter(isJapanMatch),
  );
  const nextJapanMatchAcrossCompetitions = hasJapanInSeason
    ? await getNextMatchForTeamSlug("japan", new Date().toISOString())
    : null;
  const nextJapanMatch =
    nextJapanMatchAcrossCompetitions &&
    (!nextJapanMatchInSeason ||
      nextJapanMatchAcrossCompetitions.kickoffAt <
        nextJapanMatchInSeason.kickoffAt)
      ? nextJapanMatchAcrossCompetitions
      : nextJapanMatchInSeason;
  const latestReviewMatch =
    matches
      .filter(
        (match) =>
          match.status === "finished" && contentStatusMap[match.id]?.hasRecap,
      )
      .sort((a, b) => b.kickoffAt.localeCompare(a.kickoffAt))[0] ?? null;
  const nextJapanCompetitionLabel =
    nextJapanMatchAcrossCompetitions &&
    nextJapanMatch === nextJapanMatchAcrossCompetitions &&
    (nextJapanMatchAcrossCompetitions.competition.family !== comp.family ||
      nextJapanMatchAcrossCompetitions.competition.season !== comp.season)
      ? formatCompetitionTitle(
          nextJapanMatchAcrossCompetitions.competition,
          nextJapanMatchAcrossCompetitions.competition.season,
        )
      : null;
  const leaderLabel =
    poolStandings.length > 0
      ? poolStandings
          .map((pool) =>
            pool.standings[0]
              ? `${pool.poolName}: ${pool.standings[0].teamName}`
              : null,
          )
          .filter((label): label is string => label !== null)
          .slice(0, 2)
          .join(" / ") || null
      : (standings[0]?.teamName ?? null);
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
  const hasStandings =
    standings.length > 0 ||
    poolStandings.some((pool) => pool.standings.length > 0);
  function renderStandingsBlock(rows: StandingRow[], title?: string) {
    if (rows.length === 0) {
      return null;
    }

    const excerpt = selectStandingsExcerpt(rows, hasJapanInSeason);
    const shouldCollapse = excerpt.length > 0 && excerpt.length < rows.length;

    if (!shouldCollapse) {
      return <StandingsTable standings={rows} title={title} />;
    }

    return (
      <div className="space-y-3">
        <StandingsTable standings={excerpt} title={title ?? "順位表"} />
        <details className="rounded-[var(--radius-md)] bg-white p-4 shadow-[var(--shadow-soft)]">
          <summary className="cursor-pointer rounded-full border border-slate-200 px-4 py-2 text-center text-xs font-bold text-[var(--color-accent)] transition-colors hover:border-slate-300 hover:bg-slate-50">
            全順位表を見る
          </summary>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <StandingsTable standings={rows} title={title} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <main className="bg-paper min-h-screen">
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
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-ink)]"
              href={getWebcalUrl(competitionCalendarFeedUrl)}
            >
              この大会を購読
            </Link>
            <Link
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              href={competitionCalendarFeedUrl}
            >
              大会iCal URL
            </Link>
          </div>
        </header>

        <SeasonSwitcher
          competition={competition}
          currentSeason={comp.season}
          seasons={seasons}
        />

        <SeasonSummaryBand
          leaderLabel={leaderLabel}
          latestReviewMatch={latestReviewMatch}
          nextJapanCompetitionLabel={nextJapanCompetitionLabel}
          nextJapanMatch={hasJapanInSeason ? nextJapanMatch : null}
          nextMatch={nextMatch}
        />

        <nav
          aria-label="シーズンページ内ナビ"
          className="flex gap-2 overflow-x-auto rounded-full border border-slate-200 bg-white p-1 text-sm font-bold shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <a
            className="shrink-0 rounded-full bg-[var(--color-accent)] px-4 py-2 text-white"
            href="#schedule"
          >
            日程・結果
          </a>
          {hasStandings && (
            <a
              className="shrink-0 rounded-full px-4 py-2 text-[var(--color-ink-muted)] transition-colors hover:bg-slate-50 hover:text-[var(--color-ink)]"
              href="#standings"
            >
              順位
            </a>
          )}
          <a
            className="shrink-0 rounded-full px-4 py-2 text-[var(--color-ink-muted)] transition-colors hover:bg-slate-50 hover:text-[var(--color-ink)]"
            href="#guide"
          >
            大会ガイド
          </a>
        </nav>

        {family === "league-one" && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            🌐 English match reviews available — select a match to read in
            English
          </p>
        )}

        <section className="scroll-mt-4 space-y-4" id="schedule">
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
        </section>

        {hasStandings && (
          <section className="scroll-mt-4 space-y-4" id="standings">
            {poolStandings.length > 0
              ? poolStandings.map((pool) => (
                  <div key={pool.poolName}>
                    {renderStandingsBlock(pool.standings, pool.poolName)}
                  </div>
                ))
              : renderStandingsBlock(standings)}
          </section>
        )}

        <div
          className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6"
          id="guide"
        >
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
