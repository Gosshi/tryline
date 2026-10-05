import Link from "next/link";
import { Suspense } from "react";

import { CompetitionViewingGuide } from "@/components/competition-viewing-guide";
import { PoolTeamGrid } from "@/components/pool-team-grid";
import { SeasonMatchGroups } from "@/components/season-match-groups";
import { StandingsTable } from "@/components/standings-table";
import {
  getCompetitionBySlug,
  getCompetitionGuide,
} from "@/lib/db/queries/competitions";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import {
  listMatchesForCompetition,
  type MatchListItem,
} from "@/lib/db/queries/matches";
import { getPoolStandingsForCompetition } from "@/lib/db/queries/standings";
import {
  formatKickoffJstDate,
  formatKickoffJstTime,
} from "@/lib/format/kickoff";
import { groupMatchesByRound } from "@/lib/format/match-groups";

import type { Metadata } from "next";

export const revalidate = 3600;

const RWC2027_OFFICIAL_URL =
  "https://www.rugbyworldcup.com/en/news/976797/about-mens-rugby-world-cup-2027";
const RWC2027_TOURNAMENT_DATES = "2027年10月1日〜11月13日";
const RWC2027_TOURNAMENT_MATCH_COUNT = 52;

export const metadata: Metadata = {
  title: "ラグビーワールドカップ2027 日程・出場国・日本語ガイド",
  description:
    "ラグビーワールドカップ2027の試合日程、出場国、プール順位表、放送・視聴情報、ノックアウトブラケット、日本語レビューを掲載。",
};

function isJapanMatch(match: MatchListItem): boolean {
  return match.homeTeam.slug === "japan" || match.awayTeam.slug === "japan";
}

function findNextJapanMatch(matches: MatchListItem[]): MatchListItem | null {
  const now = Date.now();

  return (
    matches
      .filter(
        (match) =>
          isJapanMatch(match) &&
          match.status === "scheduled" &&
          new Date(match.kickoffAt).getTime() >= now,
      )
      .sort((left, right) => left.kickoffAt.localeCompare(right.kickoffAt))[0] ??
    null
  );
}

function formatMatchKickoffJst(kickoffAt: string): string {
  return `${formatKickoffJstDate(kickoffAt)} ${formatKickoffJstTime(kickoffAt)}`;
}

function PendingState({ matchCount }: { matchCount?: number }) {
  return (
    <div className="tl-rwc-pending mx-auto max-w-2xl px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
        Coming Soon
      </p>
      <h1 className="mt-4 font-heading text-4xl font-extrabold text-[var(--color-ink)]">
        Rugby World Cup 2027
      </h1>
      <p className="mt-6 text-base leading-relaxed text-[var(--color-ink-muted)]">
        2027年10〜11月、オーストラリア開催。
        <br />
        プール振り分け・フィクスチャー確定後に順次公開予定です。
      </p>
      {matchCount !== undefined && (
        <div className="mt-6 text-left">
          <PreTournamentBanner matchCount={matchCount} />
        </div>
      )}
      <div className="mt-8">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-accent)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
          href="/"
        >
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}

function PreTournamentBanner({ matchCount }: { matchCount: number }) {
  return (
    <div className="tl-rwc-notice border border-[var(--color-rule)] px-5 py-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
      {RWC2027_TOURNAMENT_DATES}、オーストラリアで開催。24チーム・
      {RWC2027_TOURNAMENT_MATCH_COUNT}
      試合の大会です。Trylineでは現在{matchCount}
      試合の日程を掲載しています。開幕後、試合結果・日本語レビューを順次公開します。
    </div>
  );
}

export default async function RWC2027Page() {
  const competition = await getCompetitionBySlug("rwc-2027");

  if (!competition) {
    return (
      <main className="tl-scope tl-rwc-page bg-paper min-h-screen">
        <PendingState />
      </main>
    );
  }

  const [poolStandings, matches, guide] = await Promise.all([
    getPoolStandingsForCompetition("rwc-2027"),
    listMatchesForCompetition("rwc-2027"),
    getCompetitionGuide("rwc"),
  ]);

  if (matches.length === 0) {
    return (
      <main className="tl-scope tl-rwc-page bg-paper min-h-screen">
        <PendingState matchCount={0} />
      </main>
    );
  }

  const tournamentStarted = matches.some(
    (match) => match.status === "finished" || match.status === "in_progress",
  );
  const contentStatusMap = await getContentStatusMap(
    matches.map((match) => match.id),
  );
  const groupedMatches = groupMatchesByRound(matches);
  const venues = [
    ...new Set(
      matches
        .map((match) => match.venue)
        .filter((venue): venue is string => Boolean(venue)),
    ),
  ];
  const nextJapanMatch = findNextJapanMatch(matches);
  const rwcFaqs = [
    {
      answer: `ラグビーワールドカップ2027は${RWC2027_TOURNAMENT_DATES}に開催されます。`,
      question: "ラグビーワールドカップ2027はいつ開催されますか？",
    },
    {
      answer: `オーストラリアの${venues.length}会場で開催されます。`,
      question: "ラグビーワールドカップ2027はどこで開催されますか？",
    },
    {
      answer:
        "日本国内の放送予定は未発表です。発表後に大会公式サイトとこのページで最新情報を確認してください。",
      question: "ラグビーワールドカップ2027はどこで見られますか？",
    },
    {
      answer: nextJapanMatch
        ? `日本代表の次の試合は${formatMatchKickoffJst(nextJapanMatch.kickoffAt)}（日本時間）、${nextJapanMatch.homeTeam.name} 対 ${nextJapanMatch.awayTeam.name}です。`
        : "日本代表の次の試合は、対戦カードと日程の確定後にこのページでお知らせします。",
      question: "日本代表の次の試合はいつですか（日本時間）？",
    },
  ];
  const rwcFaqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: rwcFaqs.map((faq) => ({
      "@type": "Question",
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
      name: faq.question,
    })),
  };

  return (
    <main className="tl-scope tl-rwc-page bg-paper min-h-screen">
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(rwcFaqJsonLd),
        }}
        type="application/ld+json"
      />
      <header className="tl-season-band tl-rwc-band relative overflow-hidden bg-[var(--color-ink-strong)] text-white">
        <div
          aria-hidden="true"
          className="tl-band-art pointer-events-none absolute inset-0"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            Rugby World Cup
          </p>
          <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            ラグビーワールドカップ2027
          </h1>
          <Link
            className="tl-rwc-band-link mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            href="/c/rwc/2027/bracket"
          >
            ノックアウトブラケット →
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 md:px-8">
        {!tournamentStarted && (
          <PreTournamentBanner matchCount={matches.length} />
        )}

        {tournamentStarted && poolStandings.length > 0 && (
          <section className="tl-rwc-standings space-y-6">
            {poolStandings.map((pool) => (
              <div className="space-y-3" key={pool.poolName}>
                <h2 className="font-heading text-2xl font-extrabold text-[var(--color-ink)]">
                  {pool.poolName} 順位表
                </h2>
                <StandingsTable standings={pool.standings} />
              </div>
            ))}
          </section>
        )}

        <div className="tl-rwc-schedule space-y-5">
          <Suspense>
            <SeasonMatchGroups
              contentStatusMap={Object.fromEntries(contentStatusMap)}
              family="rwc"
              groupedMatches={groupedMatches}
            />
          </Suspense>
        </div>

        {!tournamentStarted && (
          <div className="tl-rwc-pools">
            <PoolTeamGrid
              ariaLabel="RWC 2027 プール分け"
              poolStandings={poolStandings}
            />
          </div>
        )}

        {venues.length > 0 && (
          <section
            aria-labelledby="venues-heading"
            className="tl-rwc-venues space-y-4"
          >
            <h2
              className="font-heading text-2xl font-extrabold text-[var(--color-ink)]"
              id="venues-heading"
            >
              開催都市・会場
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {venues.map((venue) => (
                <li
                  className="border-b border-[var(--color-rule)] px-4 py-4 text-sm font-medium leading-relaxed text-[var(--color-ink)]"
                  key={venue}
                >
                  {venue}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="broadcast-heading"
          className="tl-rwc-notice border border-[var(--color-rule)] px-5 py-4 text-sm leading-relaxed text-[var(--color-ink-muted)]"
        >
          <h2
            className="font-heading text-lg font-extrabold text-[var(--color-ink)]"
            id="broadcast-heading"
          >
            日本での視聴方法
          </h2>
          <p className="mt-2">
            日本国内の放送予定は未発表です。決定次第更新します。最新情報は
            <a
              className="text-[var(--color-accent)] underline underline-offset-4"
              href={RWC2027_OFFICIAL_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              大会公式サイト
            </a>
            をご確認ください。
          </p>
        </section>

        <div className="tl-rwc-guide p-5 sm:p-6">
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
