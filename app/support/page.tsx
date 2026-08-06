import Link from "next/link";

import { SITE_URL } from "@/lib/site";

import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  return {
    alternates: { canonical: `${SITE_URL}/support` },
    description:
      "Tryline の使い方、Premium の登録・解約、アカウント削除、データの誤り報告に関するご案内と問い合わせ先。",
    title: "サポート・お問い合わせ",
  };
}

const relatedLinks = [
  { href: "/legal/terms", label: "利用規約" },
  { href: "/legal/privacy", label: "プライバシーポリシー" },
  { href: "/legal/tokusho", label: "特定商取引法に基づく表記" },
  { href: "/pricing", label: "料金プラン" },
];

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <article className="space-y-8 text-[var(--color-ink)]">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Support
          </p>
          <h1 className="text-3xl font-bold tracking-normal">
            サポート・お問い合わせ
          </h1>
          <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
            Trylineのご利用に関するご質問やお困りのことは、こちらからお問い合わせください。
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">お問い合わせ方法</h2>
          <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
            ご質問・ご要望・不具合のご報告は、以下のメールアドレスまでお送りください。
          </p>
          <p className="text-sm leading-7">
            <a
              className="font-semibold text-[var(--color-accent)] underline underline-offset-4"
              href="mailto:support@trylinerugby.com"
            >
              support@trylinerugby.com
            </a>
          </p>
          <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
            （メール受付、3営業日以内を目安に返信）
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">よくある質問</h2>
          <div className="space-y-5 text-sm leading-7 text-[var(--color-ink-muted)]">
            <section className="space-y-1">
              <h3 className="font-semibold text-[var(--color-ink)]">
                ログインできない・パスワードを忘れた
              </h3>
              <p>
                ログイン画面の案内に従って、登録メールアドレス宛てにログイン用リンクをお送りします。メールが届かない場合は、迷惑メールフォルダもご確認ください。
              </p>
            </section>
            <section className="space-y-1">
              <h3 className="font-semibold text-[var(--color-ink)]">
                Premium の登録・解約
              </h3>
              <p>
                Webからの登録は料金プランページから行えます。Webで登録したPremiumはマイページから解約できます。iOSアプリで登録したサブスクリプションは、App
                Store のサブスクリプション設定から解約してください。
              </p>
            </section>
            <section className="space-y-1">
              <h3 className="font-semibold text-[var(--color-ink)]">
                アカウントを削除したい
              </h3>
              <p>
                アカウント削除をご希望の場合は、登録メールアドレスを添えてお問い合わせください。本人確認後に対応します。
              </p>
            </section>
            <section className="space-y-1">
              <h3 className="font-semibold text-[var(--color-ink)]">
                試合データ・解説の誤りを見つけた
              </h3>
              <p>
                該当する試合ページのURLと内容を添えてご連絡ください。確認のうえ、必要に応じて修正します。
              </p>
            </section>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">関連リンク</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--color-ink-muted)]">
            {relatedLinks.map((link) => (
              <li key={link.href}>
                <Link
                  className="font-medium text-[var(--color-accent)] underline underline-offset-4"
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
