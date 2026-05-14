import Image from "next/image";
import Link from "next/link";

import { FavoriteTeamsBanner } from "@/components/favorite-teams-banner";
import { MatchCard } from "@/components/match-card";
import { getUser, getUserProfile } from "@/lib/auth/server";
import {
  getCompetitionBySlug,
  listFamilies,
} from "@/lib/db/queries/competitions";
import {
  getFavoriteTeamMatches,
  getLatestCompetitionWithMatches,
  getRecentlyReviewedMatches,
  getUpcomingMatches,
} from "@/lib/db/queries/matches";
import {
  formatCompetitionTitle,
  formatFamilyName,
} from "@/lib/format/competition";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { createOgImage } from "@/lib/seo/og-image";

import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "海外ラグビーを日本語で深掘り",
  description:
    "Six Nations・Premiership・URC など海外ラグビーの試合結果・AI日本語レビューを提供。DAZN・J SPORTS 加入者向けの試合コンパニオン。",
  openGraph: {
    description:
      "Six Nations・Premiership・URC など海外ラグビーの試合結果・AI日本語レビューを提供。",
    images: [
      createOgImage({
        competition: "Tryline",
        home: "海外ラグビーを日本語で深掘り",
      }),
    ],
    title: "Tryline — 海外ラグビーを日本語で深掘り",
    type: "website",
    url: "https://tryline-six.vercel.app",
  },
};

export default async function HomePage() {
  const user = await getUser();
  const profile = user ? await getUserProfile(user.id) : null;
  const favoriteTeamSlugs = profile?.favorite_team_slugs ?? [];
  const [
    families,
    latest,
    recentReviews,
    sampleReviews,
    upcomingMatches,
    favoriteMatches,
  ] = await Promise.all([
      listFamilies(),
      getLatestCompetitionWithMatches(),
      getRecentlyReviewedMatches(3),
      getRecentlyReviewedMatches(1),
      getUpcomingMatches(5),
      getFavoriteTeamMatches(favoriteTeamSlugs),
    ]);
  const latestCompetition = latest
    ? await getCompetitionBySlug(latest.slug)
    : null;
  const sampleMatch = sampleReviews[0] ?? null;
  const favoriteTeamPageSlug =
    favoriteTeamSlugs.length === 1 ? (favoriteTeamSlugs[0] ?? null) : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden bg-[var(--color-ink)] py-16 sm:py-24">
        <div aria-hidden className="absolute inset-0 z-0">
          <Image
            alt=""
            className="object-cover object-center opacity-25"
            fill
            priority
            sizes="100vw"
            src="https://images.unsplash.com/photo-1763854413165-1713bc5a7f4a?w=1600&q=80"
          />
          <div className="bg-[var(--color-ink)]/60 absolute inset-0" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 sm:block"
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.05) 39px, rgba(255,255,255,0.05) 40px)",
                "repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.03) 59px, rgba(255,255,255,0.03) 60px)",
              ].join(", "),
            }}
          />
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.12]">
            <svg
              fill="none"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 200 120"
              width="340"
              xmlns="http://www.w3.org/2000/svg"
            >
              <ellipse cx="100" cy="60" rx="94" ry="44" strokeWidth="2" />
              <line strokeWidth="1.5" x1="6" x2="194" y1="60" y2="60" />
              <path d="M100 16 C112 35, 112 85, 100 104" strokeWidth="1.5" />
              <line strokeWidth="2" x1="88" x2="112" y1="48" y2="48" />
              <line strokeWidth="2" x1="86" x2="114" y1="54" y2="54" />
              <line strokeWidth="2" x1="86" x2="114" y1="60" y2="60" />
              <line strokeWidth="2" x1="86" x2="114" y1="66" y2="66" />
              <line strokeWidth="2" x1="88" x2="112" y1="72" y2="72" />
            </svg>
          </div>
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[var(--color-ink)] to-transparent" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            AI Rugby Analysis in Japanese
          </p>
          <h1 className="break-keep font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
            海外ラグビーを、
            <br className="hidden sm:block" />
            日本語で深掘り。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
            Six Nations をはじめとする世界のラグビーリーグを、AI
            が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
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
              href="/c/six-nations/2025"
            >
              試合を見る
            </Link>
          </div>
        </div>
      </section>

      {user && favoriteTeamSlugs.length === 0 && <FavoriteTeamsBanner />}

      {profile?.subscription_status !== "premium" &&
        sampleMatch?.recapExcerpt && (
          <section
            aria-labelledby="sample-heading"
            className="border-b border-slate-100 bg-white px-4 py-8 sm:px-6 md:px-8"
          >
            <div className="mx-auto max-w-6xl">
              <p
                className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]"
                id="sample-heading"
              >
                AI レビューのサンプル
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {formatCompetitionTitle(
                  sampleMatch.competition.name,
                  sampleMatch.competition.season,
                )}
                {" / "}
                {sampleMatch.homeTeam.name} vs {sampleMatch.awayTeam.name}
              </p>
              <p className="mt-3 line-clamp-3 text-base leading-relaxed text-[var(--color-ink)]">
                {sampleMatch.recapExcerpt}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Link
                  className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
                  href={`/matches/${sampleMatch.id}`}
                >
                  続きを読む →
                </Link>
                <Link
                  className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  href="/pricing"
                >
                  Premium を始める — ¥980/月
                </Link>
              </div>
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
                href={`/t/${favoriteTeamPageSlug}`}
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
        {latestCompetition && (
          <section>
            <Link
              className="group block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300"
              href={`/c/${latestCompetition.family}/${latestCompetition.season}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                最新シーズン
              </p>
              <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)] sm:text-4xl">
                {formatCompetitionTitle(
                  latestCompetition.name,
                  latestCompetition.season,
                )}
              </p>
              <p className="mt-4 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                試合一覧を見る →
              </p>
            </Link>
          </section>
        )}

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
                        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                          {match.homeTeam.shortCode} vs{" "}
                          {match.awayTeam.shortCode}
                        </p>
                        <p className="truncate text-xs text-[var(--color-ink-muted)]">
                          {formatFamilyName(family)}
                        </p>
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
                      <p className="mt-0.5 truncate font-semibold text-[var(--color-ink)]">
                        {match.homeTeam.name} {match.homeScore} -{" "}
                        {match.awayScore} {match.awayTeam.name}
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

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            大会アーカイブ
          </h2>
          {families.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-[var(--color-ink-muted)]">
              表示できる大会はありません
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {families.map((family) => (
                <li key={family}>
                  <Link
                    className="group flex h-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
                    href={`/c/${family}`}
                  >
                    <span className="font-semibold text-[var(--color-ink)]">
                      {formatFamilyName(family)}
                    </span>
                    <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                      全シーズン →
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
