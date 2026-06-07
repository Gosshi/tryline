import Link from "next/link";

import { WeekSchedule } from "@/components/calendar/week-schedule";
import { getMatchesInRange } from "@/lib/db/queries/matches";
import { getCurrentJstWeekRangeUtc } from "@/lib/format/week";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const revalidate = 1800;

export function generateMetadata(): Metadata {
  return {
    alternates: { canonical: `${SITE_URL}/calendar` },
    description:
      "今週開催される海外ラグビーの試合を全大会横断で確認できます。JSTの曜日別にキックオフ時刻、状態、解説リンクをまとめています。",
    title: "今週の試合カレンダー",
  };
}

export default async function CalendarPage() {
  const range = getCurrentJstWeekRangeUtc();
  const matches = await getMatchesInRange(range.startUtcIso, range.endUtcIso);

  return (
    <main className="min-h-screen bg-slate-50">
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
            今週の試合
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">
            月曜 00:00 JST から翌月曜 00:00 JST
            までの試合を、全大会横断で曜日ごとにまとめています。解説が生成済みの試合には「解説」バッジが付きます。
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-8">
        <WeekSchedule
          emptyMessage="今週表示できる試合はありません。大会ページから過去シーズンの試合を確認できます。"
          matches={matches}
        />
      </section>
    </main>
  );
}
