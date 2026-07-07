import Link from "next/link";

import { SeasonMatchGroups } from "@/components/season-match-groups";
import { StandingsTable } from "@/components/standings-table";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";
import {
  getPoolStandingsForCompetition,
  type PoolStanding,
} from "@/lib/db/queries/standings";
import { groupMatchesByRound } from "@/lib/format/match-groups";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ラグビーワールドカップ2027 日程・出場国・日本語ガイド",
  description:
    "ラグビーワールドカップ2027の試合日程、出場国、プール順位表、放送・視聴情報、ノックアウトブラケット、日本語レビューを掲載。",
};

function PendingState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
        Coming Soon
      </p>
      <h1 className="mt-4 font-serif text-4xl font-bold text-[var(--color-ink)]">
        Rugby World Cup 2027
      </h1>
      <p className="mt-6 text-base leading-relaxed text-[var(--color-ink-muted)]">
        2027年10〜11月、オーストラリア開催。
        <br />
        プール振り分け・フィクスチャー確定後に順次公開予定です。
      </p>
      <div className="mt-8">
        <Link
          className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
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
    <div className="rounded-lg border border-[var(--color-rule)] bg-white px-6 py-4 text-sm text-[var(--color-ink-muted)]">
      2027年10〜11月、オーストラリア開催。全{matchCount}
      試合のスケジュールが確定しています。開幕後、試合結果・日本語レビューを順次公開します。
    </div>
  );
}

function PoolTeamGrid({
  poolStandings,
}: {
  poolStandings: PoolStanding[];
}) {
  if (poolStandings.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="RWC 2027 プール分け"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {poolStandings.map((pool) => (
        <div
          className="rounded-[var(--radius-md)] bg-white p-4 shadow-[var(--shadow-soft)]"
          key={pool.poolName}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {pool.poolName}
          </p>
          <ul className="mt-2 space-y-1">
            {pool.standings.map((row) => (
              <li
                className="text-sm font-medium text-[var(--color-ink)]"
                key={row.position}
              >
                {row.teamName === "-" ? (
                  <span className="text-slate-400">未確定</span>
                ) : (
                  row.teamName
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default async function RWC2027Page() {
  const competition = await getCompetitionBySlug("rwc-2027");

  if (!competition) {
    return (
      <main className="min-h-screen bg-paper">
        <PendingState />
      </main>
    );
  }

  const [poolStandings, matches] = await Promise.all([
    getPoolStandingsForCompetition("rwc-2027"),
    listMatchesForCompetition("rwc-2027"),
  ]);

  if (matches.length === 0) {
    return (
      <main className="min-h-screen bg-paper">
        <PendingState />
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

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 md:px-8">
        <header className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Rugby World Cup
          </p>
          <h1 className="mt-1 font-heading text-4xl font-bold tracking-tight text-[var(--color-ink)] sm:text-5xl">
            ラグビーワールドカップ2027
          </h1>
          <div className="mt-4">
            <Link
              className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
              href="/c/rwc/2027/bracket"
            >
              ノックアウトブラケット →
            </Link>
          </div>
        </header>

        {!tournamentStarted && (
          <PreTournamentBanner matchCount={matches.length} />
        )}

        {tournamentStarted && poolStandings.length > 0 && (
          <section className="space-y-4">
            {poolStandings.map((pool) => (
              <div className="space-y-3" key={pool.poolName}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  {pool.poolName} 順位表
                </h2>
                <StandingsTable standings={pool.standings} />
              </div>
            ))}
          </section>
        )}

        <SeasonMatchGroups
          contentStatusMap={Object.fromEntries(contentStatusMap)}
          family="rwc"
          groupedMatches={groupedMatches}
        />

        {!tournamentStarted && (
          <PoolTeamGrid poolStandings={poolStandings} />
        )}
      </div>
    </main>
  );
}
