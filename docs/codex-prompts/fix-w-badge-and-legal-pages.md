# fix-w-badge-and-legal-pages: W バッジ CSS 修正 + legal ページ追加

## 背景

2つのバグを一括修正する。

1. `match-card.tsx` の `bg-[var(--color-accent)]/15` が oklch CSS 変数と非互換のため、W バッジ背景が透明になる
2. フッターの `/legal/tokusho`・`/legal/privacy`・`/legal/terms` が 404

---

## Task 1 — W バッジ背景の CSS 修正

### 原因

Tailwind の `/15`（opacity modifier）は `rgb()` / `hsl()` 形式の変数でのみ機能する。
`--color-accent` は `oklch(58% 0.18 145)` で定義されているため透明になる。

### 修正方法: `app/globals.css` に変数を追加

`:root` ブロックの Tryline design tokens に以下を追記する:

```css
:root {
  /* 既存の変数はそのまま */
  --color-accent: oklch(58% 0.18 145);

  /* 追加 */
  --color-accent-dim: color-mix(in oklch, var(--color-accent) 15%, transparent);
  --color-accent-subtle: color-mix(in oklch, var(--color-accent) 10%, transparent);
}
```

### `components/match-card.tsx` の置換

`bg-[var(--color-accent)]/15` を `bg-[var(--color-accent-dim)]` に一括置換する（2箇所）:

```tsx
// 変更前
<span className="rounded bg-[var(--color-accent)]/15 px-1 py-0.5 ...">

// 変更後
<span className="rounded bg-[var(--color-accent-dim)] px-1 py-0.5 ...">
```

`bg-[var(--color-accent)]/10` を `bg-[var(--color-accent-subtle)]` に置換する（1箇所、レビューバッジ）:

```tsx
// 変更前
<span className="rounded-full bg-[var(--color-accent)]/10 ...">

// 変更後
<span className="rounded-full bg-[var(--color-accent-subtle)] ...">
```

---

## Task 2 — legal ページの追加

フッターが参照している3ページを作成する。内容はプレースホルダーで構わない（Owner が後で更新する）。

### ファイル構成

```
app/
└── legal/
    ├── layout.tsx
    ├── tokusho/
    │   └── page.tsx
    ├── privacy/
    │   └── page.tsx
    └── terms/
        └── page.tsx
```

### `app/legal/layout.tsx`

```tsx
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {children}
    </div>
  );
}
```

### `app/legal/tokusho/page.tsx`

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表示 | Tryline",
};

export default function TokushoPage() {
  return (
    <article className="prose prose-slate">
      <h1>特定商取引法に基づく表示</h1>
      <p>本ページは準備中です。有料サービス開始時に掲載します。</p>
    </article>
  );
}
```

### `app/legal/privacy/page.tsx`

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Tryline",
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-slate">
      <h1>プライバシーポリシー</h1>
      <p>Tryline（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報を適切に管理します。</p>
      <h2>収集する情報</h2>
      <p>本サービスは、アカウント登録時にメールアドレスを収集します。</p>
      <h2>情報の利用目的</h2>
      <p>収集した情報はサービス提供・改善のためにのみ利用し、第三者に提供しません。</p>
      <h2>お問い合わせ</h2>
      <p>プライバシーに関するお問い合わせは、サービス内のお問い合わせフォームよりご連絡ください。</p>
    </article>
  );
}
```

### `app/legal/terms/page.tsx`

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約 | Tryline",
};

export default function TermsPage() {
  return (
    <article className="prose prose-slate">
      <h1>利用規約</h1>
      <p>本利用規約は、Tryline（以下「本サービス」）の利用条件を定めるものです。</p>
      <h2>サービスの利用</h2>
      <p>本サービスは、海外ラグビーの試合情報を提供する情報サービスです。</p>
      <h2>禁止事項</h2>
      <p>本サービスのコンテンツを無断で転載・商用利用することを禁じます。</p>
      <h2>免責事項</h2>
      <p>本サービスが提供する情報の正確性は保証しません。利用は自己責任でお願いします。</p>
      <h2>規約の変更</h2>
      <p>本規約は予告なく変更する場合があります。</p>
    </article>
  );
}
```

---

## 完了条件

- [ ] W バッジ（"W" テキスト横）の背景が薄い accent green で表示される
- [ ] レビューバッジ（「レビュー」）の背景が薄い accent green で表示される
- [ ] `/legal/tokusho`・`/legal/privacy`・`/legal/terms` がそれぞれ 200 を返す
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## 変更しないこと

- `match-card.tsx` のレイアウト・その他のクラス
- フッターのリンク先 URL
- `--color-accent` 本体の値
