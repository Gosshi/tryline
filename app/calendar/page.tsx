import Link from "next/link";

import { WeekSchedule } from "@/components/calendar/week-schedule";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { getStandingPositionLookupForCompetitions } from "@/lib/db/queries/standings";
import { selectCalendarFocusMatchId } from "@/lib/format/calendar-focus";
import {
  addJstDays,
  formatJstWeekRangeLabel,
  getCurrentJstWeekRangeUtc,
  getJstWeekRangeUtc,
} from "@/lib/format/week";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const revalidate = 1800;

const CALENDAR_TITLE = "今週の試合カレンダー｜海外ラグビー 日本時間";

type CalendarSearchParams = {
  week?: string | string[];
};

type CalendarPageProps = {
  searchParams?: Promise<CalendarSearchParams>;
};

async function resolveSearchParams(
  searchParams?: CalendarPageProps["searchParams"],
): Promise<CalendarSearchParams> {
  return searchParams ? await searchParams : {};
}

function getWeekParam(searchParams: CalendarSearchParams): string | null {
  const week = searchParams.week;

  if (Array.isArray(week)) {
    return week[0] ?? null;
  }

  return week ?? null;
}

function getCalendarHref(weekStartJst: string): string {
  const currentWeek = getCurrentJstWeekRangeUtc().weekStartJst;

  return weekStartJst === currentWeek ? "/calendar" : "/calendar?week=" + weekStartJst;
}

export async function generateMetadata({
  searchParams,
}: CalendarPageProps): Promise<Metadata> {
  const params = await resolveSearchParams(searchParams);
  const hasWeekParam = Boolean(getWeekParam(params));

  return {
    alternates: { canonical: SITE_URL + "/calendar" },
    description:
      "今週開催される海外ラグビーの試合を全大会横断で確認できます。JSTの曜日別にキックオフ時刻、状態、日本語レビュー・プレビューの有無をまとめています。",
    robots: hasWeekParam ? { follow: true, index: false } : undefined,
    title: CALENDAR_TITLE,
  };
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const params = await resolveSearchParams(searchParams);
  const weekParam = getWeekParam(params);
  const range = weekParam
    ? getJstWeekRangeUtc(weekParam)
    : getCurrentJstWeekRangeUtc();
  const matches = await getMatchesInRange(range.startUtcIso, range.endUtcIso);
  const competitionIds = matches
    .map((match) => match.competition.id)
    .filter((id): id is string => Boolean(id));
  const standingPositions = await getStandingPositionLookupForCompetitions(
    competitionIds,
  );
  const focusMatchId = selectCalendarFocusMatchId(matches, standingPositions);
  const previousWeek = addJstDays(range.weekStartJst, -7);
  const nextWeek = addJstDays(range.weekStartJst, 7);

  return (
    <main className="min-h-screen bg-paper">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:px-8">
          <nav className="mb-4 text-xs text-[var(--color-ink-muted)]">
            <Link className="hover:text-[var(--color-ink)]" href="/">
              ホーム
            </Link>
            <span className="mx-2">/</span>
            <span>今週の試合</span>
          </nav>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Weekly Match Calendar
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            今週の試合カレンダー
          </h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
            {formatJstWeekRangeLabel(range.weekStartJst)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="週を移動">
            <Link
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              href={getCalendarHref(previousWeek)}
            >
              前週
            </Link>
            <Link
              className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-accent)]"
              href="/calendar"
            >
              今週
            </Link>
            <Link
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              href={getCalendarHref(nextWeek)}
            >
              翌週
            </Link>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">
            月曜 00:00 JST から翌月曜 00:00 JST
            までの試合を、全大会横断で曜日ごとにまとめています。レビュー・プレビューが公開済みの試合にはバッジが付きます。
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8">
        <WeekSchedule
          emptyMessage="この週に表示できる試合はありません。大会ページから過去シーズンの試合を確認できます。"
          highlightMatchId={focusMatchId}
          matches={matches}
        />
      </section>
    </main>
  );
}
