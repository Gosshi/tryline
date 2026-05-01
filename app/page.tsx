import Link from "next/link";

import {
  getCompetitionBySlug,
  listFamilies,
} from "@/lib/db/queries/competitions";
import { getLatestCompetitionWithMatches } from "@/lib/db/queries/matches";
import { formatCompetitionTitle } from "@/lib/format/competition";

import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Tryline",
};

export default async function HomePage() {
  const [families, latest] = await Promise.all([
    listFamilies(),
    getLatestCompetitionWithMatches(),
  ]);
  const latestCompetition = latest
    ? await getCompetitionBySlug(latest.slug)
    : null;

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="bg-[var(--color-ink)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            AI Rugby Analysis in Japanese
          </p>
          <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
            海外ラグビーを、<br className="hidden sm:block" />
            日本語で深掘り。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
            Six Nations をはじめとする世界のラグビーリーグを、AI
            が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
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
                    <span className="font-semibold capitalize text-[var(--color-ink)]">
                      {family.replace(/-/g, " ")}
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
