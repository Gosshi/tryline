import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <article className="space-y-8 text-[var(--color-ink)]">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Legal
        </p>
        <h1 className="text-3xl font-bold tracking-normal">
          プライバシーポリシー
        </h1>
      </header>
      <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
        Tryline（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報を適切に管理します。
      </p>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">収集する情報</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          本サービスは、アカウント登録時にメールアドレスを収集します。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">情報の利用目的</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          収集した情報はサービス提供・改善のためにのみ利用し、第三者に提供しません。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">お問い合わせ</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          プライバシーに関するお問い合わせは、サービス内のお問い合わせフォームよりご連絡ください。
        </p>
      </section>
    </article>
  );
}
