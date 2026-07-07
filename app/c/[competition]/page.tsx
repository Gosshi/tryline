import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompetitionViewingGuide } from "@/components/competition-viewing-guide";
import { MatchCard } from "@/components/match-card";
import {
  getCompetitionGuide,
  listSeasonsByFamily,
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
  "autumn-nations": "/visuals/autumn-nations.jpg",
  "league-one": "/visuals/league-one.jpg",
  pnc: "/visuals/pnc.jpg",
  premiership: "/visuals/premiership.jpg",
  "rugby-championship": "/visuals/rugby-championship.jpg",
  "six-nations": "/visuals/six-nations.jpg",
  "super-rugby-pacific": "/visuals/super-rugby-pacific.jpg",
  "top-14": "/visuals/top-14.jpg",
  urc: "/visuals/urc.jpg",
};

const DEFAULT_COMPETITION_HERO = "/visuals/default.jpg";

const COMPETITION_DESCRIPTIONS: Record<string, string> = {
  "six-nations":
    "シックス・ネイションズはイングランド・アイルランド・スコットランド・ウェールズ・フランス・イタリアが争うヨーロッパ最高峰の国際ラグビー大会。毎年2〜3月に開催されます。",
  premiership:
    "プレミアシップはイングランドの最高峰クラブラグビーリーグ。各クラブがリーグ戦を戦い、上位チームによるプレーオフで優勝チームを決定します。",
  urc: "ユナイテッド・ラグビー・チャンピオンシップ（URC）はアイルランド・スコットランド・ウェールズ・イタリア・南アフリカのクラブが参加する欧州・南ア混合リーグです。",
  "top-14":
    "トップ14はフランスの最高峰クラブラグビーリーグ。全14クラブによるリーグ戦とプレーオフで構成され、スタッド・ド・フランスでの決勝が最大の見どころです。",
  "super-rugby-pacific":
    "スーパーラグビー・パシフィックはニュージーランド・オーストラリア・フィジー・日本のクラブが争うアジア太平洋最高峰のクラブラグビー大会です。",
  "rugby-championship":
    "ラグビーチャンピオンシップは南半球強豪国ニュージーランド・南アフリカ・アルゼンチン・オーストラリアが争う国際ラグビー大会。毎年7〜9月に開催されます。",
  "nations-championship":
    "ネーションズチャンピオンシップは World Rugby が 2026 年に創設した国際ラグビー大会。シックスネイションズ 6 か国と南半球・アジア 6 か国（NZ・南アフリカ・オーストラリア・アルゼンチン・日本・フィジー）が 7 月と 11 月の 2 フェーズで対戦し、11 月末のファイナルズウィークエンドで王者を決めます。",
  rwc: "ラグビーワールドカップは4年に1度開催されるラグビーユニオン最大の国際大会。世界各国がプール戦からノックアウトを経て世界一を決めます。",
  "autumn-nations":
    "オータムネーションズシリーズは毎年11月に開催される秋の国際マッチシリーズ。ヨーロッパのティア1国が南半球・太平洋諸国を迎えてホームゲームを行います。",
  pnc: "パシフィック・ネーションズカップは日本・フィジー・サモア・トンガ・アメリカ・カナダなどが参加するアジア太平洋の国際大会。日本代表の重要な強化機会です。",
  "league-one":
    "ジャパンラグビー リーグワンは、日本の最高峰クラブが争う国内プロラグビーリーグです。シーズンを通じて上位進出と優勝を争います。",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition } = await params;
  const name = formatFamilyName(competition);
  const overview =
    COMPETITION_DESCRIPTIONS[competition] ??
    `${name} の全シーズン試合結果・順位表・日本語レビュー一覧。`;
  const description = `${overview} 最新シーズンの順位表・日程・試合結果と、日本での視聴方法を掲載。`;
  const title = `${name} 順位表・日程・日本での視聴方法`;

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
      title: `${title} | Tryline`,
      type: "website",
      url: `${SITE_URL}/c/${competition}`,
    },
    title,
  };
}

export default async function CompetitionHubPage({ params }: Props) {
  const { competition } = await params;
  const [seasons, recentReviews, guide] = await Promise.all([
    listSeasonsByFamily(competition),
    getRecentlyReviewedMatchesForFamily(competition, 3),
    getCompetitionGuide(competition),
  ]);

  if (seasons.length === 0) {
    notFound();
  }

  const latestSeason =
    seasons.find((season) => season.matchCount > 0) ?? seasons[0];

  if (!latestSeason) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-paper">
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
          className="group block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300 active:scale-[0.98]"
          href={`/c/${competition}/${latestSeason.season}`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            最新シーズン
          </p>
          <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)]">
            {formatCompetitionTitle(latestSeason, latestSeason.season)}
          </p>
          <p className="mt-4 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
            試合一覧を見る →
          </p>
        </Link>

        <CompetitionViewingGuide markdown={guide} />

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
            {seasons.map((season) => {
              const hasContent = season.publishedContentCount > 0;
              const seasonStats = (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  <span>{season.matchCount} 試合</span>
                  {season.champion && (
                    <span className="font-semibold text-[var(--color-ink)]">
                      🏆 {season.champion}
                    </span>
                  )}
                </div>
              );

              return (
                <li key={season.slug}>
                  {hasContent ? (
                    <Link
                      className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-[#f8fafc]"
                      href={`/c/${competition}/${season.season}`}
                    >
                      <div>
                        <span className="text-lg font-semibold text-slate-900">
                          {season.season}
                        </span>
                        {seasonStats}
                      </div>
                      {season.startDate && season.endDate && (
                        <span className="shrink-0 text-sm text-slate-500">
                          {season.startDate.slice(0, 7)} 〜{" "}
                          {season.endDate.slice(0, 7)}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#f8fafc] px-5 py-4 opacity-60">
                      <div>
                        <span className="text-lg font-semibold text-slate-500">
                          {season.season}
                        </span>
                        {seasonStats}
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        準備中
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
