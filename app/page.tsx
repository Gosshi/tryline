import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CheckoutSuccessTracker } from "@/components/checkout-success-tracker";
import { FeaturedCompetitionCard } from "@/components/featured-competition-card";
import { HeroTexture } from "@/components/hero-texture";
import { HomeIntroFilm } from "@/components/home-intro-film";
import {
  getNextMatchCountdownLabel,
  HomeMatchdayBoard,
} from "@/components/home-matchday-board";
import {
  HomepageFavoriteTeams,
  HomepagePremiumCta,
  HomepageSpoilerScore,
} from "@/components/home-user-state";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { SignupSuccessTracker } from "@/components/signup-success-tracker";
import { StandingsTable } from "@/components/standings-table";
import {
  TouchlineMotion,
  TouchlineTickerButton,
} from "@/components/touchline-motion";
import { TrackedLink } from "@/components/tracked-link";
import { UserStateProvider } from "@/components/user-state-provider";
import {
  listFamilies,
  listSeasonsByFamilies,
  selectLatestSeasonWithMatches,
  sortHomepageCompetitionLinks,
} from "@/lib/db/queries/competitions";
import {
  getMatchesInRange,
  getNextMatchForCompetition,
  getNextUpcomingMatch,
  getRecentlyReviewedFamilies,
  getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedMatchById,
  getUpcomingMatches,
} from "@/lib/db/queries/matches";
import {
  getStandingPositionLookupForCompetitions,
  getStandingsForCompetition,
} from "@/lib/db/queries/standings";
import { listAllTeams } from "@/lib/db/queries/teams";
import { getFeaturedCompetition } from "@/lib/featured-competition";
import { selectCalendarFocusMatchId } from "@/lib/format/calendar-focus";
import {
  formatCompetitionTitle,
  formatFamilyName,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { getTeamColor } from "@/lib/format/team-identity";
import { getCurrentJstWeekRangeUtc } from "@/lib/format/week";
import {
  getHomeReviewExcerpt,
  selectHomeBoardMatches,
  selectHomeReviews,
  selectHomeTickerMatches,
} from "@/lib/home-selection";
import { getPrimarySampleMatchId } from "@/lib/sample-matches";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const revalidate = 60;

function isFeaturedCompetitionMatch(
  match: { competition: { family: string; season: string } },
  featuredCompetition: { family: string; season: string },
) {
  return (
    match.competition.family === featuredCompetition.family &&
    match.competition.season === featuredCompetition.season
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
  const featuredCompetition = await getFeaturedCompetition();
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
      family: featuredCompetition.family,
      season: featuredCompetition.season,
    }),
    listAllTeams(),
  ]);
  const recentReviewGroup =
    recentReviewGroups.length === 1 ? recentReviewGroups[0] : null;
  const [recentReviewStandings, recentReviewNextMatch] = recentReviewGroup
    ? await Promise.all([
        getStandingsForCompetition(recentReviewGroup.competition.slug),
        getNextMatchForCompetition({
          family: recentReviewGroup.competition.family,
          season: recentReviewGroup.competition.season,
        }),
      ])
    : [[], null];
  const shouldShowRecentReviewStatusPane =
    recentReviewStandings.length > 0 || recentReviewNextMatch !== null;
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
            publishedRecapCount: latestSeason.publishedRecapCount,
            season: latestSeason.season,
          };
        }),
      )
    ).filter((link) => link !== null),
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const tickerMatches = selectHomeTickerMatches(weeklyMatches, now);
  const homepageWeekMatches = weeklyMatches
    .filter((match) => match.kickoffAt > nowIso)
    .slice(0, 6);
  const homepageBoardMatches = selectHomeBoardMatches({
    weekMatches: weeklyMatches,
    upcomingMatches,
    now,
  });
  if (homepageBoardMatches.length === 0) {
    const nextMatch = await getNextUpcomingMatch();
    if (nextMatch) homepageBoardMatches.push(nextMatch);
  }
  const homepageNextUpcomingMatch =
    homepageWeekMatches.length === 0
      ? (homepageBoardMatches.find((match) => match.kickoffAt > nowIso) ?? null)
      : null;
  const weekCompetitionIds = homepageBoardMatches
    .map((match) => match.competition.id)
    .filter((id): id is string => Boolean(id));
  const homepageStandingPositions =
    await getStandingPositionLookupForCompetitions(weekCompetitionIds);
  const homepageFocusMatchId = selectCalendarFocusMatchId(
    homepageWeekMatches,
    homepageStandingPositions,
  );
  const featuredCompetitionMatches = homepageWeekMatches.filter((match) =>
    isFeaturedCompetitionMatch(match, featuredCompetition),
  );
  const featuredCompetitionLink = homepageCompetitionLinks.find(
    (competition) =>
      competition.family === featuredCompetition.family &&
      competition.season === featuredCompetition.season,
  );
  const featuredCompetitionStats = {
    nextMatchLabel: featuredCompetitionNextMatch
      ? `${formatKickoffJstDate(featuredCompetitionNextMatch.kickoffAt)} ${formatKickoffJstTime(featuredCompetitionNextMatch.kickoffAt)}`
      : "次回日程を確認中",
    nextMatchSubLabel: featuredCompetitionNextMatch
      ? `${featuredCompetitionNextMatch.homeTeam.name} 対 ${featuredCompetitionNextMatch.awayTeam.name}`
      : "今季の予定は確認でき次第反映します",
    publishedReviewCount: featuredCompetitionLink?.publishedRecapCount ?? 0,
    weekMatchCount: featuredCompetitionMatches.length,
  };
  const homeReviews = selectHomeReviews(recentReviewGroups);
  const [leadReview, ...minorReviews] = homeReviews;
  const exploreLinks = new Map<string, { label: string; href: string }>();
  for (const competition of homepageCompetitionLinks) {
    const href = `/c/${competition.family}/${competition.season}`;
    exploreLinks.set(href, {
      href,
      label: `${formatFamilyName(competition.family)} ${competition.season} 最新シーズン`,
    });
    if (competition.family === "rwc") {
      exploreLinks.set("/c/rwc/2027", {
        href: "/c/rwc/2027",
        label: "ラグビーワールドカップ 2027",
      });
    }
  }
  // Keep every competition destination, including groups outside the three cards.
  for (const competition of [
    ...reviewedFamilies.map((item) => ({
      family: item.family,
      season: item.competitionSeason,
    })),
    ...recentReviewGroups.map((group) => group.competition),
  ]) {
    const href = `/c/${competition.family}/${competition.season}`;
    if (!exploreLinks.has(href))
      exploreLinks.set(href, {
        href,
        label: `${formatFamilyName(competition.family)} ${competition.season}`,
      });
  }
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
    <TouchlineMotion page="home" className="bg-paper min-h-screen">
      <UserStateProvider>
        <script
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          type="application/ld+json"
        />
        <Suspense>
          <CheckoutSuccessTracker />
          <SignupSuccessTracker />
        </Suspense>
        <section className="tl-home-hero relative min-h-[480px] overflow-hidden bg-[var(--color-ink-strong)] py-14 sm:min-h-[560px] sm:py-20">
          <HeroTexture />
          <div
            aria-hidden
            data-tl-loop="poster"
            className="tl-poster-field absolute inset-0 z-0"
          >
            <Image
              alt=""
              className="object-cover object-center"
              fill
              priority
              sizes="100vw"
              src="/visuals/home-hero.jpg"
            />
            <span className="tl-stadium-ring" />
            <span className="tl-stadium-ring tl-ring-two" />
            <span className="tl-pitch-lines" />
            <span className="tl-goal-post" />
            <div className="tl-hero-scrim absolute inset-0" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1536px] px-4 sm:px-6 md:px-8">
            <div className="tl-hero-layout grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)] lg:gap-12">
              <div>
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#d5b88b]">
                  Rugby Analysis in Japanese
                </p>
                <h1 className="tl-hero-heading max-w-5xl text-balance font-serif text-[clamp(2.5rem,6.5vw,6rem)] font-extrabold leading-[1.25] tracking-tight text-white">
                  <span data-tl-motion="headline" className="inline-block">
                    {homepageWeekMatches.length > 0 ? "今週の海外" : "次の海外"}
                  </span>
                  <span data-tl-motion="headline" className="inline-block">
                    ラグビーを、
                  </span>
                  <span data-tl-motion="headline" className="inline-block">
                    {homepageWeekMatches.length > 0
                      ? "日本時間で追う。"
                      : "日本時間で待つ。"}
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-white/[0.85]">
                  {homepageWeekMatches.length > 0
                    ? "PNC、Six Nations、Premiership、URC。週末に重なる試合を、日程・結果・順位・日本語レビューまでひとつの流れで確認できます。"
                    : "次のキックオフに備えて、日程と応援したいチームを確認。試合が始まれば、日本語レビューまでひとつの流れで追えます。"}
                </p>
                {homepageWeekMatches.length === 0 &&
                  homepageNextUpcomingMatch && (
                    <div className="mt-4 space-y-2 text-sm font-semibold text-white/[0.85]">
                      <p>
                        {getNextMatchCountdownLabel(
                          homepageNextUpcomingMatch.kickoffAt,
                        )}
                      </p>
                      <p className="flex flex-wrap items-center gap-2">
                        <Link
                          className="inline-flex min-h-11 items-center underline underline-offset-4"
                          href={`/teams/${homepageNextUpcomingMatch.homeTeam.slug}`}
                        >
                          {homepageNextUpcomingMatch.homeTeam.name}
                        </Link>
                        <span>対</span>
                        <Link
                          className="inline-flex min-h-11 items-center underline underline-offset-4"
                          href={`/teams/${homepageNextUpcomingMatch.awayTeam.slug}`}
                        >
                          {homepageNextUpcomingMatch.awayTeam.name}
                        </Link>
                        <Link
                          className="inline-flex min-h-11 items-center rounded-full border border-white/30 px-4"
                          href="/?notifications=open"
                        >
                          通知設定を開く
                        </Link>
                      </p>
                    </div>
                  )}
                <div className="mt-8 flex flex-wrap gap-3">
                  <TrackedLink
                    analytics={{
                      cta_id: "home_hero_calendar",
                      cta_location: "home_hero",
                      destination: "calendar",
                      label:
                        homepageWeekMatches.length > 0
                          ? "今週の試合を見る"
                          : "試合カレンダーを見る",
                    }}
                    className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    href="/calendar"
                  >
                    {homepageWeekMatches.length > 0
                      ? "今週の試合を見る"
                      : "試合カレンダーを見る"}
                  </TrackedLink>
                  <HomepagePremiumCta />
                </div>
              </div>
              <HomeIntroFilm />
            </div>
          </div>
        </section>

        {tickerMatches.length > 0 && (
          <aside
            aria-label="試合と結果"
            data-tl-loop="ticker"
            className="tl-ticker border-b border-[var(--color-rule)] bg-[var(--color-ink-strong)] text-white"
          >
            <div className="tl-ticker-window">
              <div className="tl-ticker-track">
                {[false, true].map((duplicate) => (
                  <div
                    aria-hidden={duplicate ? true : undefined}
                    className={
                      duplicate ? "tl-ticker-lap tl-duplicate" : "tl-ticker-lap"
                    }
                    inert={duplicate ? true : undefined}
                    key={String(duplicate)}
                  >
                    {tickerMatches.map((match) => (
                      <Link
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                        href={`/matches/${match.id}`}
                        key={match.id}
                        tabIndex={duplicate ? -1 : undefined}
                      >
                        <span className="text-xs text-white/75">
                          {formatFamilyName(match.competition.family)} ·{" "}
                          {formatKickoffJstDate(match.kickoffAt)}
                        </span>
                        <span className="font-semibold">
                          {match.homeTeam.name}
                        </span>
                        <span className="inline-flex w-16 shrink-0 items-center justify-center">
                          {match.homeScore !== null &&
                          match.awayScore !== null ? (
                            <HomepageSpoilerScore className="min-h-11 max-w-full whitespace-normal px-1 text-[10px] text-white">
                              <span className="font-bold tabular-nums">
                                {match.homeScore}–{match.awayScore}
                              </span>
                            </HomepageSpoilerScore>
                          ) : (
                            <span className="text-white/75">対</span>
                          )}
                        </span>
                        <span className="font-semibold">
                          {match.awayTeam.name}
                        </span>
                        <span className="text-xs tabular-nums text-white/75">
                          {formatKickoffJstTime(match.kickoffAt)}
                        </span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <TouchlineTickerButton />
          </aside>
        )}

        {homepageBoardMatches.length > 0 && (
          <section
            aria-labelledby="home-week-heading"
            className="mx-auto max-w-[1536px] px-4 pt-6 sm:px-6 sm:pt-6 md:px-8"
          >
            <div className="tl-section-heading mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-rule)] pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-brass)]">
                  Next matches / 日本時間
                </p>
                <h2
                  className="mt-2 text-3xl font-extrabold"
                  id="home-week-heading"
                >
                  これからの試合
                </h2>
              </div>
            </div>
            <HomeMatchdayBoard
              focusMatchId={homepageFocusMatchId}
              matches={homepageBoardMatches}
              standingPositions={homepageStandingPositions}
            />
            <TrackedLink
              analytics={{
                cta_id: "home_hero_calendar",
                cta_location: "home_hero",
                destination: "calendar",
                label: "今週の全試合を見る",
              }}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              href="/calendar"
            >
              今週の全試合を見る →
            </TrackedLink>
          </section>
        )}

        <HomepageFavoriteTeams allTeams={allTeams} />

        <div className="mx-auto max-w-[1536px] space-y-6 px-4 py-6 sm:px-6 sm:py-6 md:px-8">
          <section className="tl-editorial-section space-y-3">
            <h2 className="font-serif text-2xl font-extrabold text-[var(--color-ink)] sm:text-3xl">
              注目大会
            </h2>
            <FeaturedCompetitionCard
              description={featuredCompetition.description}
              family={featuredCompetition.family}
              headline={featuredCompetition.headline}
              season={featuredCompetition.season}
              stats={featuredCompetitionStats}
            />
          </section>

          {leadReview && (
            <section
              aria-labelledby="home-reviews-heading"
              className="tl-editorial-section space-y-4"
            >
              <h2
                id="home-reviews-heading"
                className="border-b border-[var(--color-rule)] pb-3 text-3xl font-extrabold text-[var(--color-ink)]"
              >
                最近のレビュー
              </h2>
              <div
                className={`tl-editorial-reviews grid grid-cols-1 items-start gap-5 ${minorReviews.length > 0 || shouldShowRecentReviewStatusPane ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}
              >
                <article
                  className="tl-review-card tl-review-lead tl-hover min-w-0"
                  data-review-size="lead"
                  style={
                    {
                      "--team-home": getTeamColor(leadReview.homeTeam.slug),
                      "--team-away": getTeamColor(leadReview.awayTeam.slug),
                    } as React.CSSProperties
                  }
                  key={leadReview.id}
                >
                  <Link
                    className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                    href={`/matches/${leadReview.id}`}
                  >
                    <div
                      aria-label="最新レビューのスコア"
                      className="tl-review-visual"
                    >
                      <span className="tl-visual-code">
                        {leadReview.homeTeam.shortCode ||
                          leadReview.homeTeam.name}
                        <i aria-hidden="true">/</i>
                        {leadReview.awayTeam.shortCode ||
                          leadReview.awayTeam.name}
                      </span>
                      <strong className="tl-review-score tabular-nums">
                        <HomepageSpoilerScore className="min-h-11 text-white">
                          {leadReview.homeScore}–{leadReview.awayScore}
                        </HomepageSpoilerScore>
                      </strong>
                      <span className="tl-visual-footer">
                        <span>{leadReview.homeTeam.name}</span>
                        <span>対</span>
                        <span>{leadReview.awayTeam.name}</span>
                      </span>
                    </div>
                    <div className="tl-review-copy">
                      <p className="text-xs font-semibold text-[var(--color-brass)]">
                        {formatCompetitionTitle(
                          leadReview.competition,
                          leadReview.competition.season,
                        )}
                      </p>
                      <h3 className="mt-2 text-xl font-extrabold text-[var(--color-ink)] sm:text-2xl">
                        {leadReview.homeTeam.name} 対 {leadReview.awayTeam.name}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                        {getHomeReviewExcerpt(leadReview.recapExcerpt)}
                      </p>
                      <span className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-accent)] group-hover:underline">
                        レビューを読む →
                      </span>
                    </div>
                  </Link>
                </article>
                {(minorReviews.length > 0 ||
                  shouldShowRecentReviewStatusPane) && (
                  <div className="tl-review-minors min-w-0 space-y-4">
                    {minorReviews.map((match) => (
                      <article
                        className="tl-review-card tl-review-small tl-hover"
                        data-review-size="minor"
                        style={
                          {
                            "--team-home": getTeamColor(match.homeTeam.slug),
                            "--team-away": getTeamColor(match.awayTeam.slug),
                          } as React.CSSProperties
                        }
                        key={match.id}
                      >
                        <Link
                          className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                          href={`/matches/${match.id}`}
                        >
                          <div className="tl-review-visual">
                            <span className="tl-visual-code">
                              {match.homeTeam.shortCode || match.homeTeam.name}
                              <i aria-hidden="true">/</i>
                              {match.awayTeam.shortCode || match.awayTeam.name}
                            </span>
                            <strong className="tl-review-score tabular-nums">
                              <HomepageSpoilerScore className="min-h-11 max-w-full px-1 text-[10px] text-white">
                                {match.homeScore}–{match.awayScore}
                              </HomepageSpoilerScore>
                            </strong>
                          </div>
                          <div className="tl-review-copy min-w-0">
                            <p className="text-[11px] font-semibold text-[var(--color-brass)]">
                              {formatCompetitionTitle(
                                match.competition,
                                match.competition.season,
                              )}
                            </p>
                            <h3 className="mt-2 text-sm font-extrabold leading-relaxed text-[var(--color-ink)] sm:text-base">
                              {match.homeTeam.name} 対 {match.awayTeam.name}
                            </h3>
                            <span className="mt-2 inline-flex items-center text-xs font-semibold text-[var(--color-accent)] group-hover:underline">
                              レビューを読む →
                            </span>
                          </div>
                        </Link>
                      </article>
                    ))}
                    {recentReviewGroup && shouldShowRecentReviewStatusPane && (
                      <aside className="min-w-0 border-t border-[var(--color-rule)] pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-extrabold text-[var(--color-ink)]">
                            大会の現在地
                          </h3>
                          <span className="text-[11px] font-semibold text-[var(--color-ink-muted)]">
                            {formatCompetitionTitle(
                              recentReviewGroup.competition,
                              recentReviewGroup.competition.season,
                            )}
                          </span>
                        </div>
                        <div
                          className={`mt-3 grid grid-cols-1 gap-3 ${recentReviewStandings.length > 0 ? "xl:grid-cols-[minmax(0,1fr)_10rem]" : ""}`}
                        >
                          {recentReviewStandings.length > 0 && (
                            <div className="min-w-0">
                              <StandingsTable
                                compact
                                excerptThreshold={5}
                                highlightedTeams={[
                                  recentReviewGroup.hero.homeTeam.name,
                                  recentReviewGroup.hero.awayTeam.name,
                                ]}
                                standings={recentReviewStandings}
                                title="現在の順位"
                              />
                            </div>
                          )}
                          <div className="min-w-0">
                            {recentReviewNextMatch && (
                              <Link
                                className="group flex min-h-11 flex-wrap content-start items-start justify-between gap-3 rounded-sm border border-[var(--color-rule)] bg-card p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                                href={`/matches/${recentReviewNextMatch.id}`}
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                                    次戦
                                  </p>
                                  <p className="mt-1 break-words text-sm font-bold text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">
                                    {recentReviewNextMatch.homeTeam.name} 対{" "}
                                    {recentReviewNextMatch.awayTeam.name}
                                  </p>
                                </div>
                                <time
                                  className="shrink-0 text-right text-xs tabular-nums text-[var(--color-ink-muted)]"
                                  dateTime={recentReviewNextMatch.kickoffAt}
                                >
                                  {formatKickoffJstDate(
                                    recentReviewNextMatch.kickoffAt,
                                  )}
                                  <br />
                                  {formatKickoffJstTime(
                                    recentReviewNextMatch.kickoffAt,
                                  )}
                                </time>
                              </Link>
                            )}
                            <Link
                              className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                              href={`/c/${recentReviewGroup.competition.family}/${recentReviewGroup.competition.season}`}
                            >
                              大会ページを見る →
                            </Link>
                          </div>
                        </div>
                      </aside>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--color-rule)] pt-2">
                {sampleMatch && (
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
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                    href={`/matches/${sampleMatch.id}`}
                  >
                    無料サンプルを読む →
                  </TrackedLink>
                )}
                <TrackedLink
                  analytics={{
                    cta_id: "home_recent_reviews_pricing",
                    cta_location: "home_recent_reviews",
                    destination: "pricing",
                    label: "他のレビューも7日間無料で読む",
                  }}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                  href="/pricing"
                >
                  他のレビューも 7 日間無料で読む
                </TrackedLink>
              </div>
            </section>
          )}

          <NewsletterSignup source="home" />

          <section
            aria-labelledby="home-competitions-heading"
            className="space-y-3 border-t border-[var(--color-rule)] pt-5"
          >
            <h2
              id="home-competitions-heading"
              className="text-xl font-extrabold text-[var(--color-ink)]"
            >
              大会から探す
            </h2>
            {exploreLinks.size === 0 ? (
              <p className="text-sm text-[var(--color-ink-muted)]">
                表示できる大会はありません
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 md:grid-cols-4">
                {[...exploreLinks.values()].map(({ href, label }) => (
                  <li className="min-w-0" key={href}>
                    <Link
                      className="inline-flex min-h-11 items-center py-2 text-xs leading-relaxed text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                      href={href}
                      aria-label={label}
                    >
                      {label.replace(/ 最新シーズン$/, "")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </UserStateProvider>
    </TouchlineMotion>
  );
}
