import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rugby World Cup 2027",
  description: "RWC 2027 の試合・プール順位表・AI 日本語レビューを準備中です。",
};

export default function RWC2027Page() {
  return (
    <main className="min-h-screen bg-slate-50">
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
    </main>
  );
}
