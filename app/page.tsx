import Link from "next/link";

import {
  getCompetitionBySlug,
  listFamilies,
} from "@/lib/db/queries/competitions";
import { getLatestCompetitionWithMatches } from "@/lib/db/queries/matches";
import {
  formatCompetitionTitle,
  formatFamilyName,
} from "@/lib/format/competition";

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
      <section className="relative overflow-hidden bg-[var(--color-ink)] py-16 sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 sm:block"
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.05) 39px, rgba(255,255,255,0.05) 40px)",
                "repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.03) 59px, rgba(255,255,255,0.03) 60px)",
              ].join(", "),
            }}
          />
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.12]">
            <svg
              fill="none"
              stroke="white"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 200 120"
              width="340"
              xmlns="http://www.w3.org/2000/svg"
            >
              <ellipse cx="100" cy="60" rx="94" ry="44" strokeWidth="2" />
              <line strokeWidth="1.5" x1="6" x2="194" y1="60" y2="60" />
              <path d="M100 16 C112 35, 112 85, 100 104" strokeWidth="1.5" />
              <line strokeWidth="2" x1="88" x2="112" y1="48" y2="48" />
              <line strokeWidth="2" x1="86" x2="114" y1="54" y2="54" />
              <line strokeWidth="2" x1="86" x2="114" y1="60" y2="60" />
              <line strokeWidth="2" x1="86" x2="114" y1="66" y2="66" />
              <line strokeWidth="2" x1="88" x2="112" y1="72" y2="72" />
            </svg>
          </div>
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[var(--color-ink)] to-transparent" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
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
                    <span className="font-semibold text-[var(--color-ink)]">
                      {formatFamilyName(family)}
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
