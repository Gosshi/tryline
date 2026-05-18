import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchCard } from "@/components/match-card";
import {
  listSeasonsByFamily,
  selectLatestSeasonWithMatches,
} from "@/lib/db/queries/competitions";
import { getRecentlyReviewedMatchesForFamily } from "@/lib/db/queries/matches";
import {
  formatCompetitionTitle,
  formatFamilyName,
} from "@/lib/format/competition";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string }>;
};

const COMPETITION_HERO_IMAGES: Record<string, string> = {
  "six-nations":
    "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80",
  premiership:
    "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1200&q=80",
  "urc":
    "https://images.unsplash.com/photo-1480099225005-2513c8947aec?w=1200&q=80",
  "top-14":
    "https://images.unsplash.com/photo-1529663297269-6d349ec39b57?w=1200&q=80",
  "super-rugby-pacific":
    "https://images.unsplash.com/photo-1595432973730-d07ba6b406c2?w=1200&q=80",
  "rugby-championship":
    "https://images.unsplash.com/photo-1570878786170-0723365bdf35?w=1200&q=80",
  rwc: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80",
};

const DEFAULT_COMPETITION_HERO =
  "https://images.unsplash.com/photo-1767190937750-d6aaf8ea99d0?w=1200&q=80";

const COMPETITION_DESCRIPTIONS: Record<string, string> = {
  "league-one":
    "ジャパンラグビー リーグワンは、日本の最高峰クラブが争う国内プロラグビーリーグです。シーズンを通じて上位進出と優勝を争います。",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition } = await params;
  const name = formatFamilyName(competition);
  const description = `${name} の全シーズン試合結果・順位表・AI日本語レビュー一覧。`;

  return {
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
      title: `${name} — 全シーズン一覧 | Tryline`,
      type: "website",
      url: `${SITE_URL}/c/${competition}`,
    },
    title: `${name} — 全シーズン一覧`,
  };
}

export default async function CompetitionHubPage({ params }: Props) {
  const { competition } = await params;
  const [seasons, recentReviews] = await Promise.all([
    listSeasonsByFamily(competition),
    getRecentlyReviewedMatchesForFamily(competition, 3),
  ]);

  if (seasons.length === 0) {
    notFound();
  }

  const latestSeason = selectLatestSeasonWithMatches(seasons);

  if (!latestSeason) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="relative h-48 w-full overflow-hidden sm:h-56">
        <Image
          alt={formatFamilyName(competition)}
          className="object-cover object-center"
          fill
          priority
          sizes="100vw"
          src={COMPETITION_HERO_IMAGES[competition] ?? DEFAULT_COMPETITION_HERO}
        />
        <div className="absolute inset-0 bg-slate-950/60" />
        <div className="absolute inset-0 flex flex-col justify-end px-4 pb-6 sm:px-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {formatFamilyName(competition)}
            </h1>
            <p className="mt-1 text-sm text-white/70">全シーズン一覧</p>
            {COMPETITION_DESCRIPTIONS[competition] && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">
                {COMPETITION_DESCRIPTIONS[competition]}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 md:px-8">
        <Link
          className="group block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300"
          href={`/c/${competition}/${latestSeason.season}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            最新シーズン
          </p>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)]">
            {formatCompetitionTitle(latestSeason.name, latestSeason.season)}
          </p>
          <p className="mt-4 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
            試合一覧を見る →
          </p>
        </Link>

        {recentReviews.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              最近のレビュー
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {recentReviews.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            全シーズン
          </h2>
          <ul className="space-y-3">
            {seasons.map((season) => (
              <li key={season.slug}>
                <Link
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
                  href={`/c/${competition}/${season.season}`}
                >
                  <span className="text-lg font-semibold text-slate-900">
                    {season.season}
                  </span>
                  {season.startDate && season.endDate && (
                    <span className="text-sm text-slate-500">
                      {season.startDate.slice(0, 7)} 〜{" "}
                      {season.endDate.slice(0, 7)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
