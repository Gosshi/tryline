export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="mb-10 text-center font-serif text-3xl font-bold tracking-tight text-slate-950">
          プランを選ぶ
        </h1>
        <div className="grid gap-6 sm:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-lg font-bold text-slate-950">Free</p>
            <p className="mt-1 text-3xl font-black text-slate-950">¥0</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>試合スコア・順位表</li>
              <li>レビュー冒頭 300 文字</li>
            </ul>
          </section>
          <section className="rounded-xl border-2 border-[var(--color-accent)] bg-white p-6">
            <p className="text-lg font-bold text-slate-950">Premium</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              ¥980
              <span className="text-base font-normal text-slate-500">/月</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>レビュー・プレビュー全文</li>
              <li>AI チャット</li>
            </ul>
            <form action="/api/stripe/checkout" method="POST">
              <button
                className="mt-6 w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white hover:opacity-90"
                type="submit"
              >
                Premium を始める
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
