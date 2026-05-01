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
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        <section className="border-b border-slate-200 bg-white py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-600">
              AI Rugby Analysis in Japanese
            </p>
            <h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
              海外ラグビーを、日本語で深掘り。
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600">
              Six Nations をはじめとする世界のラグビーリーグを、AI
              が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
            </p>
          </div>
        </section>

        {latestCompetition && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
              最新シーズン
            </h2>
            <Link
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
              href={`/c/${latestCompetition.family}/${latestCompetition.season}`}
            >
              <span className="text-lg font-semibold text-slate-900">
                {formatCompetitionTitle(
                  latestCompetition.name,
                  latestCompetition.season,
                )}
              </span>
              <span className="text-sm text-slate-500">試合一覧 →</span>
            </Link>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
            大会アーカイブ
          </h2>
          {families.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              表示できる大会はありません
            </p>
          ) : (
            <ul className="space-y-2">
              {families.map((family) => (
                <li key={family}>
                  <Link
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
                    href={`/c/${family}`}
                  >
                    <span className="font-semibold capitalize text-slate-900">
                      {family.replace(/-/g, " ")}
                    </span>
                    <span className="text-sm text-slate-500">全シーズン →</span>
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
