# 料金ページ SEO 修正（canonical / OGP 画像 / FAQPage 構造化データ）

## 背景

2026-06-01 の Playwright 実測評価（`docs/growth-playbook-2026-06.md` 施策 S5）で、料金ページ（`app/pricing/page.tsx`）に以下の SEO 欠落を確認した:

1. **canonical なし**: `metadata.alternates.canonical` が未設定（本番で null を確認）。重複 URL（クエリ付き等）の正規化シグナルが欠ける。
2. **OGP 画像なし**: `metadata.openGraph` 自体が未定義のため、X・LINE・Slack でシェアすると画像なしのカードになる（クリック率を損なう）。ホーム・試合ページは OGP 画像を持つのに料金ページだけ欠落。
3. **可視 FAQ があるのに FAQPage 構造化データなし**: ページには6件の FAQ（`faqs` 配列）が表示されているが、出力している JSON-LD は `VideoObject` のみ。`FAQPage` schema があれば Google のリッチリザルト（FAQ アコーディオン表示）の対象になり得る。

`p3-ogp-image.md` は料金ページの OGP を「Server Component 化後に実施」として先送りしていたが、現在 `app/pricing/page.tsx` は **async Server Component**（`export default async function PricingPage()`）であり、metadata も export 済みなので実施可能。
`fix-pricing-faq-trial.md` は FAQ の**本文**追加が目的で、構造化データは対象外だった。本仕様がそのギャップを埋める。

## スコープ

対象:
- `app/pricing/page.tsx` — `metadata` に `alternates.canonical` と `openGraph` を追加 / 既存 `faqs` 配列から `FAQPage` JSON-LD を生成して出力

対象外:
- `/api/og` ルートの拡張（料金ページは静的 `/og-image.png` を使う。理由は下記）
- FAQ の文言変更（`fix-pricing-faq-trial.md` で整備済み）
- チェックアウト（`PricingForm`）・Stripe ロジック
- `VideoObject` JSON-LD（既存のまま維持）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

表示上の変化なし（canonical/OGP は `<head>`、FAQPage は不可視の JSON-LD）。FAQ の見た目（`<article>` リスト）は現状維持。

## 変更詳細

### 変更1: canonical と OGP 画像（`app/pricing/page.tsx` L15-19）

**現状:**
```typescript
export const metadata: Metadata = {
  title: "プランを選ぶ",
  description:
    "¥980/月で海外ラグビーの AI 日本語レビュー全文・AI チャットが読み放題。",
};
```

**変更後:**
```typescript
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/pricing` },
  description:
    "¥980/月で海外ラグビーの AI 日本語レビュー全文・AI チャットが読み放題。",
  openGraph: {
    description:
      "¥980/月で海外ラグビーの AI 日本語レビュー全文・AI チャットが読み放題。",
    images: [{ height: 630, url: `${SITE_URL}/og-image.png`, width: 1200 }],
    locale: "ja_JP",
    title: "プランを選ぶ | Tryline",
    type: "website",
    url: `${SITE_URL}/pricing`,
  },
  title: "プランを選ぶ",
};
```

> **なぜ静的 `/og-image.png` か**: `/api/og` ルート（`app/api/og/route.tsx`）は試合カード専用パラメータ（`home`/`away`/`score`/`comp`/`status`）のみ受け付け、汎用 `title` を解釈しない。料金ページに動的 OG を作るにはルート拡張が必要で、本仕様の目的（「シェア時に画像が出る」）には静的画像で十分。ブランド OG 画像の作り込みは将来タスク。
> `metadataBase` は `app/layout.tsx` で `SITE_URL` に設定済みのため、相対 `"/og-image.png"` でも可。ただし他ページに合わせ絶対 URL（`${SITE_URL}/og-image.png`）で統一する。

### 変更2: FAQPage 構造化データ（`app/pricing/page.tsx`）

既存の `faqs` 配列（L30-60）を単一の真実として再利用し（DRY）、`FAQPage` JSON-LD を生成する。既存の `pricingVideoJsonLd` と同じ `<script type="application/ld+json">` パターンで出力する。

`faqs` 定義の近くに追加:
```typescript
const pricingFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};
```

JSX で既存 VideoObject の `<script>`（L111-116 付近）の直後に追加:
```tsx
<script
  dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingFaqJsonLd) }}
  type="application/ld+json"
/>
```

- `faq.answer` はすでにプレーンテキスト（HTML/Markdown を含まない）ため、サニタイズや変換は不要。
- 表示中の FAQ と JSON-LD が必ず一致する（同じ `faqs` 配列由来）= Google の「不可視コンテンツを schema 化するな」ガイドラインに準拠。

## LLM 連携

なし

## 受け入れ条件

1. `curl https://www.trylinerugby.com/pricing` の HTML に `<link rel="canonical" href="https://www.trylinerugby.com/pricing">` が含まれる。
2. 同 HTML に `<meta property="og:image">`（`/og-image.png`）と `<meta property="og:locale" content="ja_JP">` が含まれる。
3. 同 HTML に `FAQPage` の JSON-LD が含まれ、`mainEntity` の各 Question/Answer が画面表示の FAQ6件と一致する。
4. Google「リッチリザルト テスト」で FAQPage が有効と判定される。
5. 既存の `VideoObject` JSON-LD は維持されている。
6. `pnpm tsc --noEmit` と `pnpm build` が通る。

## 未解決の質問

- 将来、料金ページ専用のブランド OG 画像を `/api/og` 拡張で動的生成するか（本仕様では静的画像で確定）。
- FAQ を増減した場合に JSON-LD が自動追従することの確認（同一配列由来なので原則追従する）。
