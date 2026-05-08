import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約",
};

export default function TermsPage() {
  return (
    <article className="space-y-8 text-[var(--color-ink)]">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Legal
        </p>
        <h1 className="text-3xl font-bold tracking-normal">利用規約</h1>
      </header>
      <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
        本利用規約は、Tryline（以下「本サービス」）の利用条件を定めるものです。
      </p>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">サービスの利用</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          本サービスは、海外ラグビーの試合情報を提供する情報サービスです。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">禁止事項</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          本サービスのコンテンツを無断で転載・商用利用することを禁じます。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">免責事項</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          本サービスが提供する情報の正確性は保証しません。利用は自己責任でお願いします。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">規約の変更</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          本規約は予告なく変更する場合があります。
        </p>
      </section>
    </article>
  );
}
