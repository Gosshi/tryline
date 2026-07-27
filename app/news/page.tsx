import { getPublishedWeeklyNewsItems } from "@/lib/db/queries/weekly-news";
import {
  formatJstWeekRangeLabel,
  getCurrentJstWeekRangeUtc,
} from "@/lib/format/week";
import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export const revalidate = 3600;

const NEWS_PAGE_TITLE = "今週のニュース｜海外ラグビー";

const CATEGORY_LABELS: Record<string, string> = {
  competition: "大会",
  injury: "負傷",
  other: "ニュース",
  quote: "コメント",
  transfer: "移籍・契約",
};

function formatPublishedDate(value: string | null): string {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return "公開日未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date(value));
}

export function generateMetadata(): Metadata {
  return {
    alternates: { canonical: `${SITE_URL}/news` },
    description:
      "海外ラグビーの移籍・大会・負傷・コメントに関する今週のニュースを日本語でまとめています。",
    openGraph: {
      description:
        "海外ラグビーの移籍・大会・負傷・コメントに関する今週のニュースを日本語でまとめています。",
      title: `${NEWS_PAGE_TITLE} | Tryline`,
      type: "website",
      url: `${SITE_URL}/news`,
    },
    title: NEWS_PAGE_TITLE,
  };
}

export default async function WeeklyNewsPage() {
  const week = getCurrentJstWeekRangeUtc();
  const items = await getPublishedWeeklyNewsItems(
    week.weekStartJst,
    week.weekEndJst,
  );

  return (
    <main className="bg-paper min-h-screen">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Weekly Rugby News
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--color-ink)] sm:text-4xl">
            今週のニュース
          </h1>
          <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
            {formatJstWeekRangeLabel(week.weekStartJst)}
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">
            海外ラグビーの移籍、大会、負傷、コメントに関する今週の主な動きをまとめています。
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:px-8">
        {items.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm leading-6 text-[var(--color-ink-muted)]">
            今週のニュースはまだありません。
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
                key={item.id}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-bold text-[var(--color-accent)]">
                    {CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other}
                  </span>
                  <time
                    className="text-[var(--color-ink-muted)]"
                    dateTime={item.published_at ?? undefined}
                  >
                    {formatPublishedDate(item.published_at)}
                  </time>
                </div>
                <h2 className="mt-3 text-lg font-bold leading-7 text-[var(--color-ink)]">
                  {item.title_ja}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
                  {item.summary_ja}
                </p>
                <a
                  className="mt-4 inline-flex text-sm font-bold text-[var(--color-accent)] underline underline-offset-4 hover:text-[var(--color-ink)]"
                  href={item.source_url}
                  rel="noopener"
                  target="_blank"
                >
                  出典: {item.source_domain}
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
