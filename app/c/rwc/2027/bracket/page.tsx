import Link from "next/link";

import { KnockoutBracket } from "@/components/knockout-bracket";
import { getCompetitionBySlug } from "@/lib/db/queries/competitions";
import { listMatchesForCompetition } from "@/lib/db/queries/matches";

import type { MatchListItem } from "@/lib/db/queries/matches";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Rugby World Cup 2027 ブラケット",
  description: "RWC 2027 ノックアウトステージの対戦表。",
};

type PendingStateProps =
  | { type: "competition-unavailable" }
  | {
      poolMatchCount: number;
      poolStageEndsAt: string;
      type: "teams-pending";
    }
  | { type: "knockout-unavailable" };

function formatPoolStageEnd(kickoffAt: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(kickoffAt));
}

function PendingState(props: PendingStateProps) {
  const detail =
    props.type === "teams-pending" ? (
      <>
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          ノックアウトステージの出場チームは、プール戦の結果が確定するまで決まりません。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          全{props.poolMatchCount}試合のプール戦は
          {formatPoolStageEnd(props.poolStageEndsAt)}
          まで予定されています。終了後に対戦表へ反映します。
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-accent)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
          href="/c/rwc/2027"
        >
          プール戦の日程を見る
        </Link>
      </>
    ) : props.type === "knockout-unavailable" ? (
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        ノックアウトステージの日程・結果はまだ取得できていません。確認でき次第、対戦表に反映します。
      </p>
    ) : (
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        大会情報を取得できません。時間をおいてもう一度お試しください。
      </p>
    );

  return (
    <div className="tl-rwc-pending border border-[var(--color-rule)] px-6 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        Bracket
      </p>
      <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-[var(--color-ink)]">
        Rugby World Cup 2027
      </h1>
      {detail}
    </div>
  );
}

function isKnockoutMatch(match: MatchListItem): boolean {
  return match.round !== null && match.round >= 5;
}

function getLatestKickoff(matches: MatchListItem[]): string | null {
  return matches.reduce<string | null>((latest, match) => {
    if (Number.isNaN(new Date(match.kickoffAt).getTime())) {
      return latest;
    }

    return latest === null || match.kickoffAt > latest
      ? match.kickoffAt
      : latest;
  }, null);
}

function isPoolStageComplete(
  poolMatches: MatchListItem[],
  poolStageEndsAt: string | null,
): boolean {
  return (
    poolStageEndsAt !== null &&
    new Date(poolStageEndsAt).getTime() <= Date.now() &&
    poolMatches.length > 0 &&
    poolMatches.every((match) => match.status === "finished")
  );
}

export default async function Rwc2027BracketPage() {
  const competition = await getCompetitionBySlug("rwc-2027");

  if (!competition) {
    return (
      <main className="tl-scope tl-rwc-page bg-paper min-h-screen">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
          <PendingState type="competition-unavailable" />
        </div>
      </main>
    );
  }

  const allMatches = await listMatchesForCompetition("rwc-2027");
  const matches = allMatches.filter(isKnockoutMatch);
  const poolMatches = allMatches.filter((match) => !isKnockoutMatch(match));
  const poolStageEndsAt = getLatestKickoff(poolMatches);
  const poolStageComplete = isPoolStageComplete(poolMatches, poolStageEndsAt);

  return (
    <main className="tl-scope tl-rwc-page bg-paper min-h-screen">
      <header className="tl-season-band tl-rwc-band relative overflow-hidden bg-[var(--color-ink-strong)] text-white">
        <div
          aria-hidden="true"
          className="tl-band-art pointer-events-none absolute inset-0"
        />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            Knockout
          </p>
          <h1 className="mt-3 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            Rugby World Cup 2027
          </h1>
          <Link
            className="tl-rwc-band-link mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            href="/c/rwc/2027"
          >
            大会ページへ戻る
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
        {matches.length > 0 ? (
          <KnockoutBracket matches={matches} />
        ) : poolStageComplete || poolStageEndsAt === null ? (
          <PendingState type="knockout-unavailable" />
        ) : (
          <PendingState
            poolMatchCount={poolMatches.length}
            poolStageEndsAt={poolStageEndsAt}
            type="teams-pending"
          />
        )}
      </div>
    </main>
  );
}
