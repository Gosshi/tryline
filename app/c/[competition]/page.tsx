import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompetitionViewingGuide } from "@/components/competition-viewing-guide";
import { JapanMatchesBlock } from "@/components/japan-matches-block";
import { MatchCard } from "@/components/match-card";
import { StandingsTable } from "@/components/standings-table";
import { getCompetitionHeroImage } from "@/lib/competition-hero-images";
import {
  getCompetitionGuide,
  listFamilies,
  listSeasonsByFamily,
  selectLatestSeasonWithMatches,
} from "@/lib/db/queries/competitions";
import { getMatchBroadcastsForMatches } from "@/lib/db/queries/match-broadcasts";
import {
  getRecentlyReviewedMatchesForFamily,
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
  formatMatchKickoffJst,
  getCompetitionHubState,
  getLeaderLabel,
  getMatchLabel,
  getSeasonBroadcastGuide,
  isJapanMatch,
  selectStandingsExcerpt,
} from "@/lib/format/season-summary";
import { getSeasonPeriodLabel } from "@/lib/format/season-summary";
import { isSeasonNotStarted } from "@/lib/season-standings";
import { createCompetitionOgImage } from "@/lib/seo/og-image";
import { SITE_URL } from "@/lib/site";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ competition: string }>;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const families = await listFamilies();

  return families.map((competition) => ({ competition }));
}

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
  "lipovitan-challenge-cup":
    "リポビタンDチャレンジカップは大正製薬冠スポンサーの日本代表国内開催テストマッチシリーズ。2026年はオーストラリア・カナダ・フィジー代表と対戦します。",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competition } = await params;
  const name = formatFamilyName(competition);
  const overview =
    COMPETITION_DESCRIPTIONS[competition] ??
    `${name} の全シーズン試合結果・順位表・日本語レビュー一覧。`;
  const description = `${overview} 最新シーズンの順位表・日程・試合結果と、日本での視聴方法を掲載。`;
  const title =
    competition === "lipovitan-challenge-cup"
      ? `${name} オーストラリア・カナダ・フィジー代表`
      : `${name} 順位表・日程・日本での視聴方法`;

  return {
    description,
    openGraph: {
      description,
      images: [
        createCompetitionOgImage({
          accentColor: getCompetitionFamilyColor(competition),
          familyName: formatFamilyName(competition),
        }),
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

  const latestSeason = selectLatestSeasonWithMatches(seasons);

  if (!latestSeason) {
    notFound();
  }

  const [matches, standings, poolStandings] = await Promise.all([
    listMatchesForCompetition(latestSeason.slug),
    getStandingsForCompetition(latestSeason.slug),
    getPoolStandingsForCompetition(latestSeason.slug),
  ]);
  const broadcastsByMatch = await getMatchBroadcastsForMatches(
    matches.map((match) => match.id),
  );
  const state = getCompetitionHubState(matches);
  const seasonNotStarted = isSeasonNotStarted(
    matches,
    standings,
    poolStandings,
  );
  const japanMatches = matches
    .filter((match) => match.status !== "cancelled" && isJapanMatch(match))
    .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt));
  const nextMatches =
    state === "pre" || state === "active"
      ? matches
          .filter(
            (match) =>
              match.status === "scheduled" &&
              new Date(match.kickoffAt).getTime() >= Date.now(),
          )
          .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt))
      : [];
  const previewMatches = nextMatches.slice(0, 3);
  const competitionTitle = formatCompetitionTitle(
    latestSeason,
    latestSeason.season,
  );
  const periodLabel = getSeasonPeriodLabel({
    competitionSlug: latestSeason.slug,
    matches,
    state,
  });
  const leaderLabel = getLeaderLabel({
    poolStandings,
    seasonNotStarted,
    standings,
  });
  const seasonBroadcastGuide = getSeasonBroadcastGuide(broadcastsByMatch);
  const hasStandings = standings.length > 0 || poolStandings.length > 0;
  const showStandings =
    !seasonNotStarted &&
    (hasStandings || (state === "post" && latestSeason.champion !== null));
  const excerptStandings = selectStandingsExcerpt(
    standings,
    japanMatches.length > 0,
  );

  return (
    <main className="bg-paper min-h-screen">
      <div className="relative h-48 w-full overflow-hidden sm:h-56">
        <Image
          alt={formatFamilyName(competition)}
          className="object-cover object-center"
          fill
          priority
          sizes="100vw"
          src={getCompetitionHeroImage(competition)}
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
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 md:px-8">
        <section aria-labelledby="current-season-summary" className="space-y-4">
          <h2
            className="font-heading text-xl font-bold text-[var(--color-ink)] sm:text-2xl"
            id="current-season-summary"
          >
            {competitionTitle}の日程・結果
          </h2>
          <div className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] ring-1 ring-slate-200 sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {state !== "information" && (
                  <span className="rounded-full bg-[var(--color-accent-subtle)] px-3 py-1 text-sm font-bold text-[var(--color-accent)]">
                    {state === "pre"
                      ? "開幕前"
                      : state === "active"
                        ? "開催中"
                        : "終了"}
                  </span>
                )}
                {periodLabel && (
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    {periodLabel}
                  </p>
                )}
              </div>
              <Link
                className="text-sm font-bold text-[var(--color-accent)] hover:text-[var(--color-ink)]"
                href={`/c/${competition}/${latestSeason.season}`}
              >
                {competitionTitle} の全日程・結果を見る →
              </Link>
            </div>

            {(previewMatches.length > 0 ||
              japanMatches.length > 0 ||
              showStandings ||
              state !== "information") && (
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  {previewMatches.length > 0 && (
                    <section
                      aria-labelledby="next-matches-heading"
                      className="space-y-3"
                    >
                      <h3
                        className="font-heading text-base font-bold text-[var(--color-ink)]"
                        id="next-matches-heading"
                      >
                        次の試合（日本時間）
                      </h3>
                      <ul className="space-y-2">
                        {previewMatches.map((match) => (
                          <li key={match.id}>
                            <Link
                              className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:border-slate-200 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                              href={`/matches/${match.id}`}
                            >
                              <span className="font-semibold text-[var(--color-ink)]">
                                {getMatchLabel(match)}
                              </span>
                              <span className="text-sm tabular-nums text-[var(--color-ink-muted)]">
                                {formatMatchKickoffJst(match.kickoffAt)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {nextMatches.length > 3 && (
                        <Link
                          className="inline-flex text-sm font-bold text-[var(--color-accent)]"
                          href={`/c/${competition}/${latestSeason.season}#schedule`}
                        >
                          残り {nextMatches.length - 3} 試合の日程を見る →
                        </Link>
                      )}
                    </section>
                  )}
                  <JapanMatchesBlock
                    matches={japanMatches}
                    seasonHref={`/c/${competition}/${latestSeason.season}`}
                  />
                </div>

                <div className="space-y-5">
                  {showStandings && (
                    <section
                      aria-labelledby="standings-heading"
                      className="space-y-3"
                    >
                      <h3
                        className="font-heading text-base font-bold text-[var(--color-ink)]"
                        id="standings-heading"
                      >
                        {state === "post" ? "最終順位" : "順位"}
                      </h3>
                      {state === "post" && latestSeason.champion && (
                        <p className="font-bold text-[var(--color-ink)]">
                          優勝: {latestSeason.champion}
                        </p>
                      )}
                      {leaderLabel && poolStandings.length > 0 && (
                        <p className="text-sm font-semibold text-[var(--color-ink)]">
                          {leaderLabel}
                        </p>
                      )}
                      {excerptStandings.length > 0 && (
                        <StandingsTable
                          accentColor={getCompetitionFamilyColor(competition)}
                          standings={excerptStandings}
                        />
                      )}
                      {hasStandings && (
                        <Link
                          className="inline-flex text-sm font-bold text-[var(--color-accent)]"
                          href={`/c/${competition}/${latestSeason.season}/standings`}
                        >
                          順位表をすべて見る →
                        </Link>
                      )}
                    </section>
                  )}
                  {state !== "information" && (
                    <section
                      aria-labelledby="broadcast-heading"
                      className="space-y-3"
                    >
                      <h3
                        className="font-heading text-base font-bold text-[var(--color-ink)]"
                        id="broadcast-heading"
                      >
                        日本での視聴方法
                      </h3>
                      <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
                        {seasonBroadcastGuide.answer}
                      </p>
                      {seasonBroadcastGuide.services.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                          {seasonBroadcastGuide.services.map((service) => (
                            <li key={service.serviceName}>
                              <a
                                className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-[var(--color-accent)] hover:bg-slate-50"
                                href={service.url}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                {service.serviceName}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

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

        <div className="max-w-3xl">
          <CompetitionViewingGuide
            markdown={guide?.guideJa ?? null}
            sourceUrl={guide?.sourceUrl ?? null}
            verifiedAt={guide?.verifiedAt ?? null}
          />
        </div>

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
