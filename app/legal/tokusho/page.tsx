import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示",
};

const rows = [
  ["販売事業者", "Tryline"],
  ["運営責任者", "中西 豪太"],
  [
    "所在地",
    "〒106-0032 東京都港区六本木3丁目16番12号 六本木KSビル5F",
  ],
  [
    "電話番号",
    "開示請求は support@trylinerugby.com までメールにてご連絡ください。遅滞なく開示いたします。",
  ],
  [
    "お問い合わせ先",
    "support@trylinerugby.com（メール受付、3営業日以内を目安に返信）",
  ],
  ["販売価格", "月額 ¥980（税込）"],
  [
    "商品代金以外の必要料金",
    "インターネット接続料金・通信料金はお客様のご負担となります。",
  ],
  ["支払方法", "クレジットカード決済（Stripe Checkout）"],
  ["支払時期", "申し込み時に即時課金、以降は契約更新日に自動課金"],
  ["サービス提供時期", "決済完了後、直ちに利用可能"],
  [
    "解約について",
    "マイページより次回更新日前までいつでも解約可能。解約後も当該期間終了まで利用できます。",
  ],
  [
    "返品・返金について",
    "デジタルコンテンツの性質上、法令上必要な場合を除き返金はいたしかねます。",
  ],
  [
    "動作環境",
    "最新版の主要ブラウザ（Chrome・Safari・Firefox・Edge）およびインターネット接続環境",
  ],
] as const;

export default function TokushoPage() {
  return (
    <article className="space-y-8 text-[var(--color-ink)]">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Legal
        </p>
        <h1 className="text-3xl font-bold tracking-normal">
          特定商取引法に基づく表示
        </h1>
      </header>
      <div className="overflow-hidden rounded-lg border border-[var(--color-rule)] bg-white">
        <dl className="divide-y divide-[var(--color-rule)]">
          {rows.map(([label, value]) => (
            <div
              className="grid gap-2 px-4 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
              key={label}
            >
              <dt className="text-sm font-semibold text-[var(--color-ink)]">
                {label}
              </dt>
              <dd className="text-sm leading-7 text-[var(--color-ink-muted)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}
