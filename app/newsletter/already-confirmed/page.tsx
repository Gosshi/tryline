import Link from "next/link";

export default function NewsletterAlreadyConfirmedPage() {
  return <main className="bg-paper flex min-h-screen items-center justify-center px-4"><section className="w-full max-w-lg rounded-xl border-l-4 border-[var(--color-accent)] bg-white p-6 shadow-sm"><p className="text-sm font-bold text-[var(--color-ink)]">ニュースレターの登録は完了しています</p><p className="mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">すでに確認済みです。追加の手続きは必要ありません。</p><Link className="mt-5 inline-flex rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-ink)]" href="/calendar">今週の試合を見る</Link></section></main>;
}
