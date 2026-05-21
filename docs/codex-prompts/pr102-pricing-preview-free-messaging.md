# PR #102 — Pricing ページのメッセージを「プレビュー無料」方針に更新

## 背景

PR #100 / PR #101 でプレビューを常時全文無料にしたが、
Pricing ページの機能比較表・FAQ がまだ旧方針（プレビューも Premium 限定）のままになっている。
「プレビュー無料 → レビューは Premium」のファネルを正しく説明するため、Pricing ページを更新する。

## スコープ

対象:
- `app/pricing/page.tsx`

対象外:
- その他のファイルは変更しない
- Premium 機能（レビュー全文・AI チャット）の扱いは変更しない

---

## 変更仕様

### 1. `features` 配列を更新（lines 20–28）

```ts
// Before
const features = [
  { free: true, name: "試合スコア・順位表・得点推移グラフ", premium: true },
  { free: true, name: "大会アーカイブ閲覧", premium: true },
  { free: true, name: "AI 日本語レビュー（冒頭 300 文字）", premium: true },
  { free: false, name: "AI 日本語レビュー全文", premium: true },
  { free: false, name: "AI 日本語プレビュー全文", premium: true },
  { free: false, name: "試合 AI チャット", premium: true },
  { free: true, name: "Web プッシュ通知", premium: true },
];

// After
const features = [
  { free: true, name: "試合スコア・順位表・得点推移グラフ", premium: true },
  { free: true, name: "大会アーカイブ閲覧", premium: true },
  { free: true, name: "AI 日本語プレビュー全文", premium: true },
  { free: false, name: "AI 日本語レビュー全文", premium: true },
  { free: false, name: "試合 AI チャット", premium: true },
  { free: true, name: "Web プッシュ通知", premium: true },
];
```

変更点:
- `"AI 日本語レビュー（冒頭 300 文字）"` の行を削除（この制限はなくなった）
- `"AI 日本語プレビュー全文"` を `free: true` に変更（Free でも全文読める）
- プレビュー行をレビュー行の前に移動（ファネル順に合わせる）

### 2. FAQ の「無料でどこまで使えますか」の回答を更新（line 33）

```ts
// Before
answer:
  "試合スコア・順位表・ラインナップ・Web プッシュ通知は無料でご利用いただけます。AI 日本語プレビュー・レビューは冒頭 300 文字まで無料で読めます。全文・AI チャットは Premium 限定です。",

// After
answer:
  "試合スコア・順位表・ラインナップ・AI 日本語プレビュー全文・Web プッシュ通知は無料でご利用いただけます。AI 日本語レビュー全文・AI チャットは Premium 限定です。",
```

---

## 完了の定義

- [ ] 機能比較表に「AI 日本語プレビュー全文」が Free ✓ で表示される
- [ ] 機能比較表に「AI 日本語レビュー（冒頭 300 文字）」の行がない
- [ ] FAQ の回答がプレビュー無料・レビュー Premium を正しく説明している
- [ ] TypeScript エラーなし・`pnpm build` 通過
