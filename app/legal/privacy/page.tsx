import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

const thirdPartyServices = [
  ["Supabase, Inc.", "メールアドレス", "認証・データ管理"],
  ["Stripe, Inc.", "決済に必要な情報", "決済処理"],
  ["Google LLC", "アクセスログ", "アクセス解析"],
  ["Expo Technologies, Inc.", "Push Token", "プッシュ通知配信基盤"],
] as const;

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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">はじめに</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          Tryline（以下「当サービス」）は、ユーザーのプライバシーを尊重し、個人情報を適切に管理します。本ポリシーは、当サービスが収集する情報、その利用目的、および管理方法について説明します。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">収集する情報</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          以下の情報を収集します。
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--color-ink-muted)]">
          <li>
            <span className="font-semibold text-[var(--color-ink)]">
              アカウント情報:
            </span>{" "}
            メールアドレス（Supabase Auth 経由で収集）
          </li>
          <li>
            <span className="font-semibold text-[var(--color-ink)]">
              決済情報:
            </span>{" "}
            クレジットカード番号等の決済データは Stripe, Inc.
            が管理します。当サービスはカード番号等のセンシティブな決済情報を直接保持しません
          </li>
          <li>
            <span className="font-semibold text-[var(--color-ink)]">
              アクセス情報:
            </span>{" "}
            ページ閲覧履歴、参照元 URL、ブラウザ種別、IP アドレス等（Google
            Analytics 4 経由で収集）
          </li>
          <li>
            <span className="font-semibold text-[var(--color-ink)]">
              モバイルアプリの利用情報:
            </span>{" "}
            iOSアプリ利用時、プッシュ通知配信のためのPush Token、お気に入りチームの選択、通知設定（試合前通知・コンテンツ公開通知）、ネタバレ防止設定を収集します
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">情報の利用目的</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          収集した情報は以下の目的で利用します。
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--color-ink-muted)]">
          <li>サービスの提供・運営・改善</li>
          <li>サブスクリプション決済の処理</li>
          <li>ユーザーサポートへの対応</li>
          <li>サービスの利用状況の分析</li>
          <li>プッシュ通知の配信</li>
          <li>ユーザー設定（お気に入りチーム・通知設定・ネタバレ防止設定）の同期</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cookie およびアクセス解析</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          当サービスは Google LLC が提供する Google Analytics 4
          を使用しており、Cookie
          を通じてアクセス情報を収集しています。収集された情報は Google
          のプライバシーポリシーに基づき管理されます。
        </p>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          Google Analytics のオプトアウトを希望する場合は、
          <a
            className="font-medium text-[var(--color-accent)] underline underline-offset-4"
            href="https://tools.google.com/dlpage/gaoptout"
            rel="noreferrer"
            target="_blank"
          >
            Google アナリティクス オプトアウト アドオン
          </a>
          をご利用ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">第三者への情報提供</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          当サービスは、以下の第三者サービスを利用しており、必要な範囲で情報を提供しています。
        </p>
        <div className="overflow-hidden rounded-lg border border-[var(--color-rule)] bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#f8fafc] text-[var(--color-ink)]">
              <tr>
                <th className="px-4 py-3 font-semibold">サービス</th>
                <th className="px-4 py-3 font-semibold">提供する情報</th>
                <th className="px-4 py-3 font-semibold">目的</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)] text-[var(--color-ink-muted)]">
              {thirdPartyServices.map(([service, information, purpose]) => (
                <tr key={service}>
                  <td className="px-4 py-3">{service}</td>
                  <td className="px-4 py-3">{information}</td>
                  <td className="px-4 py-3">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          法令に基づく場合を除き、上記以外の第三者に個人情報を提供しません。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">情報の管理</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          収集した情報は、不正アクセス・紛失・漏洩を防ぐため適切な安全対策を講じて管理します。不要になった情報は速やかに削除します。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">プライバシーポリシーの変更</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          本ポリシーは予告なく変更することがあります。変更後のポリシーは本ページに掲載した時点で効力を生じます。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">お問い合わせ</h2>
        <p className="text-sm leading-7 text-[var(--color-ink-muted)]">
          個人情報の取り扱いに関するお問い合わせは、以下のメールアドレスまでご連絡ください。
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
          （メール受付、3 営業日以内を目安に返信）
        </p>
      </section>

      <p className="text-xs text-[var(--color-ink-muted)]">
        最終更新日: 2026年8月2日
      </p>
    </article>
  );
}
