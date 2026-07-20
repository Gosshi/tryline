import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CheckoutSuccessTracker } from "@/components/checkout-success-tracker";
import { FeaturedCompetitionCard } from "@/components/featured-competition-card";
import { HeroTexture } from "@/components/hero-texture";
import { HomeMatchdayBoard } from "@/components/home-matchday-board";
import {
  HomepageFavoriteTeams,
  HomepagePremiumCta,
  HomepageSpoilerScore,
  HomepageUserStateProvider,
} from "@/components/home-user-state";
import { SignupSuccessTracker } from "@/components/signup-success-tracker";
import { TeamBadge } from "@/components/team-badge";
import { TrackedLink } from "@/components/tracked-link";
import { getCompetitionHeroImage } from "@/lib/competition-hero-images";
import {
  listFamilies,
  listSeasonsByFamilies,
  selectLatestSeasonWithMatches,
  sortHomepageCompetitionLinks,
} from "@/lib/db/queries/competitions";
import {
  getMatchesInRange,
  getNextMatchForCompetition,
  getRecentlyReviewedFamilies,
  getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedMatchById,
  getUpcomingMatches,
} from "@/lib/db/queries/matches";
import { getStandingPositionLookupForCompetitions } from "@/lib/db/queries/standings";
import { listAllTeams } from "@/lib/db/queries/teams";
import { FEATURED_COMPETITION } from "@/lib/featured-competition";
import { selectCalendarFocusMatchId } from "@/lib/format/calendar-focus";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getTeamColor } from "@/lib/format/team-identity";
import { getCurrentJstWeekRangeUtc } from "@/lib/format/week";
import { getPrimarySampleMatchId } from "@/lib/sample-matches";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const revalidate = 60;

const COMPETITION_LOGO_FAMILIES = new Set([
  "autumn-nations",
  "league-one",
  "nations-championship",
  "pnc",
  "premiership",
  "rugby-championship",
  "rwc",
  "six-nations",
  "super-rugby-pacific",
  "top-14",
  "urc",
]);

function getCompetitionLogoSrc(family: string): string {
  return COMPETITION_LOGO_FAMILIES.has(family)
    ? `/logos/${family}.svg`
    : "/logos/default-competition.svg";
}

function getHomeWeekLabel(weekStartJst: string): string {
  const [, month, day] = weekStartJst.split("-").map(Number);

  return String(month) + "月第" + Math.ceil((day ?? 1) / 7) + "週";
}

function isFeaturedCompetitionMatch(match: {
  competition: { family: string; season: string };
}) {
  return (
    match.competition.family === FEATURED_COMPETITION.family &&
    match.competition.season === FEATURED_COMPETITION.season
  );
}

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  description:
    "Six Nations・Premiership・URC・リーグワンなど海外ラグビーの試合結果・順位表・日本語レビューを毎節お届け。英語情報を追い切れない週末も、日本語で試合の流れを深く追える試合コンパニオン。",
  openGraph: {
    description:
      "Six Nations・Premiership・URC・リーグワンなど海外ラグビーの試合結果・順位表・日本語レビューを毎節お届け。",
    images: [
      {
        height: 630,
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
      },
    ],
    locale: "ja_JP",
    title: "Tryline — 海外ラグビーを日本語で深掘り",
    type: "website",
    url: SITE_URL,
  },
  title: { absolute: "海外ラグビー 試合結果・順位・日本語レビュー | Tryline" },
};

export default async function HomePage() {
  const weekRange = getCurrentJstWeekRangeUtc();
  const sampleMatchId = await getPrimarySampleMatchId();
  const [
    families,
    reviewedFamilies,
    recentReviewGroups,
    sampleMatch,
    weeklyMatches,
    upcomingMatches,
    featuredCompetitionNextMatch,
    allTeams,
  ] = await Promise.all([
    listFamilies(),
    getRecentlyReviewedFamilies(4),
    getRecentlyReviewedCompetitionGroups("ja"),
    getRecentlyReviewedMatchById(sampleMatchId, "ja"),
    getMatchesInRange(weekRange.startUtcIso, weekRange.endUtcIso),
    getUpcomingMatches(5),
    getNextMatchForCompetition({
      family: FEATURED_COMPETITION.family,
      season: FEATURED_COMPETITION.season,
    }),
    listAllTeams(),
  ]);
  const seasonsByFamily = await listSeasonsByFamilies(families);
  const homepageCompetitionLinks = sortHomepageCompetitionLinks(
    (
      await Promise.all(
        families.map(async (family) => {
          const latestSeason = selectLatestSeasonWithMatches(
            seasonsByFamily.get(family) ?? [],
          );

          if (!latestSeason || latestSeason.matchCount === 0) {
            return null;
          }

          return {
            endDate: latestSeason.endDate,
            family,
            name: latestSeason.name,
            publishedContentCount: latestSeason.publishedContentCount,
            season: latestSeason.season,
          };
        }),
      )
    ).filter((link) => link !== null),
  );
  const nowIso = new Date().toISOString();
  const homepageWeekMatches = weeklyMatches
    .filter((match) => match.kickoffAt >= nowIso)
    .slice(0, 6);
  const homepageUpcomingMatches = upcomingMatches.filter(
    (match) =>
      !homepageWeekMatches.some((weekMatch) => weekMatch.id === match.id),
  );
  const weekCompetitionIds = homepageWeekMatches
    .map((match) => match.competition.id)
    .filter((id): id is string => Boolean(id));
  const homepageStandingPositions =
    await getStandingPositionLookupForCompetitions(weekCompetitionIds);
  const homepageFocusMatchId = selectCalendarFocusMatchId(
    homepageWeekMatches,
    homepageStandingPositions,
  );
  const featuredCompetitionMatches = homepageWeekMatches.filter(
    isFeaturedCompetitionMatch,
  );
  const featuredCompetitionLink = homepageCompetitionLinks.find(
    (competition) =>
      competition.family === FEATURED_COMPETITION.family &&
      competition.season === FEATURED_COMPETITION.season,
  );
  const featuredCompetitionStats = {
    nextMatchLabel: featuredCompetitionNextMatch
      ? `${formatKickoffJstDate(featuredCompetitionNextMatch.kickoffAt)} ${formatKickoffJstTime(featuredCompetitionNextMatch.kickoffAt)}`
      : "次回日程を確認中",
    nextMatchSubLabel: featuredCompetitionNextMatch
      ? `${featuredCompetitionNextMatch.homeTeam.name} 対 ${featuredCompetitionNextMatch.awayTeam.name}`
      : "今季の予定は確認でき次第反映します",
    publishedReviewCount: featuredCompetitionLink?.publishedContentCount ?? 0,
    weekMatchCount: featuredCompetitionMatches.length,
  };
  const shouldShowSampleReview = Boolean(sampleMatch?.recapExcerpt);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Tryline",
      potentialAction: {
        "@type": "SearchAction",
        "query-input": "required name=search_term_string",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/?q={search_term_string}`,
        },
      },
      url: SITE_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      logo: `${SITE_URL}/og-image.png`,
      name: "Tryline",
      sameAs: ["https://x.com/tryline_rugbyjp"],
      url: SITE_URL,
    },
  ];

  return (
    <main className="bg-paper min-h-screen">
      <HomepageUserStateProvider>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <Suspense>
        <CheckoutSuccessTracker />
        <SignupSuccessTracker />
      </Suspense>
      <section className="relative overflow-hidden bg-[var(--color-ink)] py-16 sm:py-24">
        <HeroTexture />
        <div aria-hidden className="absolute inset-0 z-0">
          <Image
            alt=""
            className="object-cover object-center opacity-25"
            fill
            priority
            sizes="100vw"
            src="/visuals/home-hero.jpg"
          />
          <div className="bg-[var(--color-ink)]/60 absolute inset-0" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1536px] px-4 sm:px-6 md:px-8">
          <div
            className={
              homepageWeekMatches.length > 0
                ? "grid grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1.25fr)_minmax(460px,0.75fr)]"
                : "max-w-3xl"
            }
          >
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
                Rugby Analysis in Japanese
              </p>
              <h1 className="max-w-3xl text-balance font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
                  今週の海外ラグビーを、日本時間で追う。
                </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
                PNC、Six
                Nations、Premiership、URC。週末に重なる試合を、日程・結果・順位・日本語レビューまでひとつの流れで確認できます。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <TrackedLink
                  analytics={{
                    cta_id: "home_hero_calendar",
                    cta_location: "home_hero",
                    destination: "calendar",
                    label: "今週の試合を見る",
                  }}
                  className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  href="/calendar"
                >
                  今週の試合を見る
                </TrackedLink>
                <HomepagePremiumCta />
              </div>
            </div>
            <HomeMatchdayBoard
              focusMatchId={homepageFocusMatchId}
              matches={homepageWeekMatches}
              standingPositions={homepageStandingPositions}
              weekLabel={getHomeWeekLabel(weekRange.weekStartJst)}
            />
          </div>
        </div>
      </section>

      <HomepageFavoriteTeams allTeams={allTeams} />

      <div className="mx-auto max-w-[1536px] space-y-12 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-bold text-[var(--color-ink)] sm:text-3xl">
            注目大会
          </h2>
          <FeaturedCompetitionCard stats={featuredCompetitionStats} />
        </section>

        {homepageUpcomingMatches.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              今後の試合
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {homepageUpcomingMatches.map((match, index) => {
                  const family = match.competition.slug.replace(
                    /-\d{4}(-\d{2})?$/,
                    "",
                  );

                  if (index === 0) {
                    return (
                      <li className="relative overflow-hidden" key={match.id}>
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-1"
                          style={{
                            backgroundColor: getTeamColor(match.homeTeam.slug),
                          }}
                        />
                        <span
                          aria-hidden
                          className="absolute inset-y-0 right-0 w-1"
                          style={{
                            backgroundColor: getTeamColor(match.awayTeam.slug),
                          }}
                        />
                        <Link
                          className="block px-5 py-5 transition-colors hover:bg-[#f8fafc] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:px-6"
                          href={`/matches/${match.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                                注目の次戦
                              </p>
                              <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-ink)]">
                                {formatKickoffJstDate(match.kickoffAt)}
                              </p>
                            </div>
                            <time
                              className="font-number text-2xl font-black tabular-nums text-[var(--color-ink)] sm:text-3xl"
                              dateTime={match.kickoffAt}
                            >
                              {formatKickoffJstTime(match.kickoffAt)}
                            </time>
                          </div>
                          <div className="mt-4 flex min-w-0 items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <TeamBadge
                                shortCode={match.homeTeam.shortCode}
                                size={44}
                                slug={match.homeTeam.slug}
                              />
                              <span className="truncate text-base font-bold text-[var(--color-ink)] sm:text-lg">
                                {match.homeTeam.name}
                              </span>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-slate-400">
                              対
                            </span>
                            <div className="flex min-w-0 flex-1 items-center justify-end gap-3 text-right">
                              <span className="truncate text-base font-bold text-[var(--color-ink)] sm:text-lg">
                                {match.awayTeam.name}
                              </span>
                              <TeamBadge
                                shortCode={match.awayTeam.shortCode}
                                size={44}
                                slug={match.awayTeam.slug}
                              />
                            </div>
                          </div>
                          <span className="mt-4 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            {formatFamilyName(family)}
                          </span>
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={match.id}>
                      <Link
                        className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#f8fafc] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:gap-4"
                        href={`/matches/${match.id}`}
                      >
                        <div className="shrink-0">
                          <time dateTime={match.kickoffAt}>
                            <p className="text-xs font-semibold tabular-nums text-[var(--color-accent)]">
                              {formatKickoffJstDate(match.kickoffAt)}
                            </p>
                            <p className="text-xs tabular-nums text-[var(--color-ink-muted)]">
                              {formatKickoffJstTime(match.kickoffAt)}
                            </p>
                          </time>
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <TeamBadge
                            shortCode={match.homeTeam.shortCode}
                            size={30}
                            slug={match.homeTeam.slug}
                          />
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">
                            {match.homeTeam.shortCode}
                            <span className="mx-1.5 font-normal text-slate-400">
                              対
                            </span>
                            {match.awayTeam.shortCode}
                          </p>
                          <TeamBadge
                            shortCode={match.awayTeam.shortCode}
                            size={30}
                            slug={match.awayTeam.slug}
                          />
                        </div>
                        <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 sm:inline-block">
                          {formatFamilyName(family)}
                        </span>
                        <span className="sr-only">
                          {formatFamilyName(family)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
          </section>
        )}

        {(recentReviewGroups.length > 0 || shouldShowSampleReview) && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              最近のレビュー
            </h2>
            <div className="grid gap-5 xl:grid-cols-2">
              {shouldShowSampleReview && sampleMatch && (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-[#f8fafc] px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                      無料で読めるレビュー
                    </p>
                    <span className="bg-[var(--color-accent)]/10 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
                      Sample
                    </span>
                  </div>
                  <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {formatCompetitionTitle(
                          sampleMatch.competition,
                          sampleMatch.competition.season,
                        )}
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-[var(--color-ink)]">
                        {sampleMatch.homeTeam.name} 対{" "}
                        {sampleMatch.awayTeam.name}
                      </p>
                      <p className="line-clamp-7 mt-4 max-w-3xl border-l-4 border-[var(--color-accent)] pl-4 text-sm leading-relaxed text-[var(--color-ink)]">
                        {sampleMatch.recapExcerpt}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-accent)]">
                        試合後に聞けること
                      </p>
                      <ul className="mt-3 space-y-2 text-sm font-semibold text-[var(--color-ink)]">
                        <li>勝敗を分けた場面はどこ？</li>
                        <li>日本代表の次戦にどう影響する？</li>
                        <li>この選手はどんなタイプ？</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
                    <TrackedLink
                      analytics={{
                        content_type: "recap",
                        cta_id: "home_recent_reviews_sample_recap",
                        cta_location: "home_recent_reviews",
                        destination: "sample_match",
                        is_sample: true,
                        label: "無料サンプルを読む",
                        match_id: sampleMatch.id,
                      }}
                      className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
                      href={`/matches/${sampleMatch.id}`}
                    >
                      無料サンプルを読む →
                    </TrackedLink>
                    <TrackedLink
                      analytics={{
                        cta_id: "home_recent_reviews_pricing",
                        cta_location: "home_recent_reviews",
                        destination: "pricing",
                        label: "他のレビューも7日間無料で読む",
                      }}
                      className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
                      href="/pricing"
                    >
                      他のレビューも7日間無料で読む
                    </TrackedLink>
                  </div>
                </div>
              )}
              {recentReviewGroups.map((group) => {
                const match = group.hero;

                return (
                  <div
                    className="space-y-2"
                    key={`${group.competition.slug}-${group.latestReviewAt}`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <h3 className="truncate text-sm font-black text-[var(--color-ink)]">
                        {formatCompetitionTitle(
                          group.competition,
                          group.competition.season,
                        )}
                      </h3>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--color-ink-muted)] ring-1 ring-slate-200">
                        最新節
                      </span>
                    </div>
                    <Link
                      className="group block overflow-hidden rounded-2xl px-5 py-5 text-white shadow-[0_18px_36px_rgb(15_23_42/0.18)] transition-all duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] active:scale-[0.98]"
                      href={`/matches/${match.id}`}
                      style={{
                        background: `linear-gradient(180deg, rgb(12 16 28 / 12%), rgb(12 16 28 / 34%)), linear-gradient(120deg, ${getTeamColor(match.homeTeam.slug)}, ${getTeamColor(match.awayTeam.slug)})`,
                      }}
                    >
                      <p className="bg-white/18 inline-flex rounded-full px-3 py-1 text-[11px] font-bold text-white/95 backdrop-blur-sm">
                        {formatCompetitionTitle(
                          match.competition,
                          match.competition.season,
                        )}
                      </p>
                      <div className="mt-4 flex min-w-0 items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="flex min-w-0 items-center gap-2 overflow-hidden text-lg font-black leading-tight sm:text-xl">
                            <TeamBadge
                              shortCode={match.homeTeam.shortCode}
                              size={24}
                              slug={match.homeTeam.slug}
                            />
                            <span className="truncate">
                              {match.homeTeam.name}
                            </span>
                          </p>
                          <p className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden text-lg font-black leading-tight sm:text-xl">
                            <TeamBadge
                              shortCode={match.awayTeam.shortCode}
                              size={24}
                              slug={match.awayTeam.slug}
                            />
                            <span className="truncate">
                              {match.awayTeam.name}
                            </span>
                          </p>
                        </div>
                        <p className="shrink-0 font-number text-3xl font-black tabular-nums sm:text-4xl">
                          <HomepageSpoilerScore
                            className="max-w-[8rem] text-white"
                          >
                            {match.homeScore}–{match.awayScore}
                          </HomepageSpoilerScore>
                        </p>
                      </div>
                      <span className="mt-4 inline-flex text-sm font-bold text-white/90 transition-transform group-hover:translate-x-1">
                        レビューを読む →
                      </span>
                    </Link>

                    {group.compact.length > 0 && (
                      <ul className="divide-y divide-slate-200 rounded-xl bg-white px-1 shadow-sm shadow-slate-200/40 ring-1 ring-slate-200">
                        {group.compact.map((compactMatch) => (
                          <li key={compactMatch.id}>
                            <Link
                              className="group flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-[#f8fafc] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                              href={`/matches/${compactMatch.id}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-medium text-[var(--color-ink-muted)]">
                                  {formatCompetitionTitle(
                                    compactMatch.competition,
                                    compactMatch.competition.season,
                                  )}
                                </p>
                                <p className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-sm font-semibold text-[var(--color-ink)]">
                                  <span className="truncate">
                                    {compactMatch.homeTeam.shortCode}
                                  </span>
                                  <span className="shrink-0 font-number tabular-nums text-slate-500">
                                    <HomepageSpoilerScore
                                      className="max-w-[7rem]"
                                    >
                                      {compactMatch.homeScore}–
                                      {compactMatch.awayScore}
                                    </HomepageSpoilerScore>
                                  </span>
                                  <span className="truncate">
                                    {compactMatch.awayTeam.shortCode}
                                  </span>
                                </p>
                              </div>
                              <span className="shrink-0 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                                →
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {reviewedFamilies.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              最近レビューのある大会
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {reviewedFamilies.map((item) => (
                <li key={item.family}>
                  <Link
                      className="group grid h-full grid-cols-[6rem_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm active:scale-[0.98] sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
                      href={`/c/${item.family}/${item.competitionSeason}`}
                    >
                      <div className="relative min-h-[4.5rem] overflow-hidden sm:min-h-24">
                        <Image
                          alt=""
                          className="object-cover transition-transform duration-200 group-hover:scale-105"
                          fill
                          sizes="(min-width: 640px) 128px, 96px"
                          src={getCompetitionHeroImage(item.family)}
                        />
                        <div
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-1"
                          style={{
                            backgroundColor: getCompetitionFamilyColor(
                              item.family,
                            ),
                          }}
                        />
                      </div>
                      <div className="min-w-0 self-center py-4 pl-4">
                        <span className="block font-semibold text-[var(--color-ink)]">
                          {formatFamilyName(item.family)}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
                          {item.competitionSeason}
                        </span>
                      </div>
                      <span className="self-center px-4 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                        →
                      </span>
                    </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            大会アーカイブ
          </h2>
          {homepageCompetitionLinks.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-[var(--color-ink-muted)]">
              表示できる大会はありません
            </p>
          ) : (
            <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {homepageCompetitionLinks.map((competition, index) => {
                const accent = getCompetitionFamilyColor(competition.family);
                const isFeatured = index === 0;

                return (
                  <li
                    className={isFeatured ? "w-44 shrink-0" : "w-32 shrink-0"}
                    key={`${competition.family}-${competition.season}`}
                  >
                    <Link
                      aria-label={`${formatFamilyName(competition.family)} ${competition.season} 最新シーズン`}
                      className="group flex h-24 flex-col justify-between overflow-hidden rounded-2xl px-4 py-3 text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] active:scale-[0.98]"
                      href={`/c/${competition.family}/${competition.season}`}
                      style={{
                        background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 92%, #111827), ${accent})`,
                      }}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-white/40">
                        <Image
                          alt=""
                          aria-hidden="true"
                          className="h-7 w-7 object-contain"
                          height={28}
                          src={getCompetitionLogoSrc(competition.family)}
                          width={28}
                        />
                      </span>
                      <span>
                        <span className="line-clamp-2 text-sm font-black leading-tight">
                          {formatFamilyName(competition.family)}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-white/75">
                          {competition.season}
                          <span className="sr-only"> 最新シーズン</span>
                          {competition.family === "league-one" && (
                            <span className="bg-white/18 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/85">
                              EN
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                    {competition.family === "rwc" && (
                      <Link
                        className="mt-2 block rounded-lg px-1 text-xs font-medium text-[var(--color-accent)] underline underline-offset-4 transition-colors hover:text-[var(--color-accent-strong)]"
                        href="/c/rwc/2027"
                      >
                        2027年大会（オーストラリア開催）の日程はこちら →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      </HomepageUserStateProvider>
    </main>
  );
}
