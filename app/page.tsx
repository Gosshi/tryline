import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { CheckoutSuccessTracker } from "@/components/checkout-success-tracker";
import { FavoriteTeamsBanner } from "@/components/favorite-teams-banner";
import { HeroTexture } from "@/components/hero-texture";
import { MatchCard } from "@/components/match-card";
import { TeamBadge } from "@/components/team-badge";
import { getUser, getUserProfile } from "@/lib/auth/server";
import {
  listFamilies,
  listSeasonsByFamily,
  selectLatestSeasonWithMatches,
  sortHomepageCompetitionLinks,
} from "@/lib/db/queries/competitions";
import {
  getFavoriteTeamMatches,
  getRecentlyReviewedFamilies,
  getRecentlyReviewedMatches,
  getUpcomingMatches,
} from "@/lib/db/queries/matches";
import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const revalidate = 60;

const COMPETITION_LOGO_FAMILIES = new Set([
  "autumn-nations",
  "league-one",
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

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  description:
    "Six Nations・Premiership・URC・リーグワンなど海外ラグビーの試合結果・順位表・AI日本語レビューを毎節お届け。海外ラグビーを日本語で深く追いたいファンのための試合コンパニオン。",
  openGraph: {
    description:
      "Six Nations・Premiership・URC・リーグワンなど海外ラグビーの試合結果・順位表・AI日本語レビューを毎節お届け。",
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
  title: { absolute: "海外ラグビー 試合結果・順位・日本語AIレビュー | Tryline" },
};

export default async function HomePage() {
  const user = await getUser();
  const profile = user ? await getUserProfile(user.id) : null;
  const favoriteTeamSlugs = profile?.favorite_team_slugs ?? [];
  const [
    families,
    reviewedFamilies,
    recentReviews,
    sampleReviews,
    upcomingMatches,
    favoriteMatches,
  ] = await Promise.all([
    listFamilies(),
    getRecentlyReviewedFamilies(4),
    getRecentlyReviewedMatches(3, "ja"),
    getRecentlyReviewedMatches(1, "ja"),
    getUpcomingMatches(5),
    getFavoriteTeamMatches(favoriteTeamSlugs),
  ]);
  const homepageCompetitionLinks = sortHomepageCompetitionLinks(
    (
      await Promise.all(
        families.map(async (family) => {
          const latestSeason = selectLatestSeasonWithMatches(
            await listSeasonsByFamily(family),
          );

          if (!latestSeason || latestSeason.matchCount === 0) {
            return null;
          }

          return {
            endDate: latestSeason.endDate,
            family,
            name: latestSeason.name,
            season: latestSeason.season,
          };
        }),
      )
    ).filter((link) => link !== null),
  );
  const sampleMatch = sampleReviews[0] ?? null;
  const favoriteTeamPageSlug =
    favoriteTeamSlugs.length === 1 ? (favoriteTeamSlugs[0] ?? null) : null;
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
    <main className="min-h-screen bg-slate-50">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <Suspense>
        <CheckoutSuccessTracker />
      </Suspense>
      <section className="relative overflow-hidden bg-[var(--color-ink)] py-16 sm:py-24">
        <HeroTexture />
        <div aria-hidden className="absolute inset-0 z-0">
          <video
            autoPlay
            className="absolute inset-0 h-full w-full object-cover object-center opacity-25"
            loop
            muted
            playsInline
            preload="none"
          >
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
          <div className="bg-[var(--color-ink)]/60 absolute inset-0" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            AI Rugby Analysis in Japanese
          </p>
          <h1 className="break-keep font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
            海外ラグビーを、
            <br className="hidden sm:block" />
            日本語で深掘り。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
            Six Nations、Premiership、URC、Top 14、Rugby Championship、
            ジャパンラグビー リーグワンまで、世界のラグビーを AI
            日本語レビューと試合チャットで深く追えます。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {profile?.subscription_status !== "premium" && (
              <Link
                className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                href="/pricing"
              >
                Premium を始める — ¥980/月
              </Link>
            )}
            <Link
              className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={
                reviewedFamilies[0]
                  ? `/c/${reviewedFamilies[0].family}/${reviewedFamilies[0].competitionSeason}`
                  : "/"
              }
            >
              試合を見る
            </Link>
          </div>
          {sampleMatch?.recapExcerpt && (
            <Link
              className="mt-8 block max-w-xl rounded-xl border border-white/15 bg-white/10 p-4 text-white/90 shadow-lg shadow-black/10 backdrop-blur-sm transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              href={`/matches/${sampleMatch.id}`}
            >
              <p className="text-xs font-semibold text-white/55">
                {formatCompetitionTitle(
                  sampleMatch.competition.name,
                  sampleMatch.competition.season,
                )}
              </p>
              <p className="mt-1 text-sm font-bold text-white">
                {sampleMatch.homeTeam.name} vs {sampleMatch.awayTeam.name}
                {sampleMatch.homeScore !== null &&
                  sampleMatch.awayScore !== null && (
                    <span className="ml-2 font-semibold tabular-nums text-white/70">
                      {sampleMatch.homeScore}–{sampleMatch.awayScore}
                    </span>
                  )}
              </p>
              <p className="mt-3 line-clamp-6 text-sm leading-6 text-white/75">
                {sampleMatch.recapExcerpt}
              </p>
              <p className="mt-3 text-right text-xs font-semibold text-white">
                プレビュー全文を読む →
              </p>
            </Link>
          )}
        </div>
      </section>

      {user && favoriteTeamSlugs.length === 0 && <FavoriteTeamsBanner />}

      {profile?.subscription_status !== "premium" &&
        sampleMatch?.recapExcerpt && (
          <section
            aria-labelledby="sample-heading"
            className="mx-4 my-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:mx-6 md:mx-8 lg:mx-auto lg:max-w-6xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]"
                id="sample-heading"
              >
                AI レビューのサンプル
              </p>
              <span className="bg-[var(--color-accent)]/10 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
                Premium
              </span>
            </div>
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-xs text-[var(--color-ink-muted)]">
                {formatCompetitionTitle(
                  sampleMatch.competition.name,
                  sampleMatch.competition.season,
                )}
              </p>
              <p className="mt-0.5 text-sm font-bold text-[var(--color-ink)]">
                {sampleMatch.homeTeam.name} vs {sampleMatch.awayTeam.name}
              </p>
            </div>
            <div className="mx-5 my-4 border-l-4 border-[var(--color-accent)] pl-4">
              <p className="line-clamp-8 text-sm leading-relaxed text-[var(--color-ink)]">
                {sampleMatch.recapExcerpt}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
              <Link
                className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
                href={`/matches/${sampleMatch.id}`}
              >
                この試合を見る →
              </Link>
              <Link
                className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
                href="/pricing"
              >
                Premium を登録 — ¥980/月
              </Link>
            </div>
          </section>
        )}

      {favoriteMatches.length > 0 && (
        <section
          aria-labelledby="favorite-heading"
          className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8"
        >
          <div
            className="mb-4 flex items-center justify-between gap-4"
            id="favorite-heading"
          >
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--color-accent)]">
              応援チームの試合
            </h2>
            {favoriteTeamPageSlug && (
              <Link
                className="text-xs text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                href={`/teams/${favoriteTeamPageSlug}`}
              >
                チームページ →
              </Link>
            )}
          </div>
          <ul className="space-y-3">
            {favoriteMatches.map((match) => (
              <li key={match.id}>
                <MatchCard match={match} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        {upcomingMatches.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              今後の試合
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {upcomingMatches.map((match) => {
                const family = match.competition.slug.replace(
                  /-\d{4}(-\d{2})?$/,
                  "",
                );

                return (
                  <li key={match.id}>
                    <Link
                      className="flex flex-col gap-1.5 px-5 py-3.5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] sm:flex-row sm:items-center sm:gap-3"
                      href={`/matches/${match.id}`}
                    >
                      <div className="shrink-0 sm:w-36">
                        <time dateTime={match.kickoffAt}>
                          <p className="text-xs font-semibold tabular-nums text-[var(--color-accent)]">
                            {formatKickoffJstDate(match.kickoffAt)}
                          </p>
                          <p className="text-xs tabular-nums text-[var(--color-ink-muted)]">
                            {formatKickoffJstTime(match.kickoffAt)}
                          </p>
                        </time>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
                          <TeamBadge
                            shortCode={match.homeTeam.shortCode}
                            size={18}
                            slug={match.homeTeam.slug}
                          />
                          <span className="truncate">
                            {match.homeTeam.shortCode}
                          </span>
                          <span className="shrink-0 font-normal text-slate-400">
                            vs
                          </span>
                          <TeamBadge
                            shortCode={match.awayTeam.shortCode}
                            size={18}
                            slug={match.awayTeam.slug}
                          />
                          <span className="truncate">
                            {match.awayTeam.shortCode}
                          </span>
                        </p>
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {formatFamilyName(family)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {recentReviews.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              最近のレビュー
            </h2>
            <ul className="space-y-3">
              {recentReviews.map((match) => (
                <li key={match.id}>
                  <Link
                    className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                    href={`/matches/${match.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {formatCompetitionTitle(
                          match.competition.name,
                          match.competition.season,
                        )}
                      </p>
                      <p className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-sm font-semibold text-[var(--color-ink)]">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <TeamBadge
                            shortCode={match.homeTeam.shortCode}
                            size={20}
                            slug={match.homeTeam.slug}
                          />
                          <span className="truncate">
                            {match.homeTeam.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-normal tabular-nums text-slate-400">
                          {match.homeScore} - {match.awayScore}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <TeamBadge
                            shortCode={match.awayTeam.shortCode}
                            size={20}
                            slug={match.awayTeam.slug}
                          />
                          <span className="truncate">
                            {match.awayTeam.name}
                          </span>
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                      レビューを読む →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {reviewedFamilies.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              最近レビューのある大会
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {reviewedFamilies.map((item) => (
                <li key={item.family}>
                  <Link
                    className="group flex h-full items-center justify-between rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    href={`/c/${item.family}/${item.competitionSeason}`}
                    style={{
                      borderLeftColor: getCompetitionFamilyColor(item.family),
                      borderLeftWidth: "4px",
                    }}
                  >
                    <div>
                      <span className="block font-semibold text-[var(--color-ink)]">
                        {formatFamilyName(item.family)}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
                        {item.competitionSeason}
                      </span>
                    </div>
                    <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
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
            <ul className="grid gap-3 sm:grid-cols-2">
              {homepageCompetitionLinks.map((competition) => (
                <li key={`${competition.family}-${competition.season}`}>
                  <Link
                    className="group flex h-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    href={`/c/${competition.family}/${competition.season}`}
                    style={{
                      borderLeftColor: getCompetitionFamilyColor(
                        competition.family,
                      ),
                      borderLeftWidth: "4px",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-50 ring-1 ring-slate-100">
                        <Image
                          alt={formatFamilyName(competition.family)}
                          className="h-9 w-9 object-contain"
                          height={36}
                          src={getCompetitionLogoSrc(competition.family)}
                          width={36}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="block font-semibold text-[var(--color-ink)]">
                            {formatFamilyName(competition.family)}
                          </span>
                          {competition.family === "league-one" && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              EN
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
                          {competition.season}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                      最新シーズン →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
