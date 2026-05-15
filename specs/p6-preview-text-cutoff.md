# プレビューテキスト切り詰め修正（文末整合）

## 背景

試合一覧の各カードに表示されるプレビューテキストが、文の途中で切れている。
例: 「スコットランドはパリ五輪の余韻冷めやらぬ中、...を活かし た相手に対し、前...」
文字数でトリムしているため、読点や語中で切断され、日本語として意味が取れない。

ユーザーは「この試合を読みたい」と感じる前に不完全な文に遭遇するため、
クリック誘因（続きを読む CTA）が機能しない。

## スコープ

対象:
- 試合一覧カードのプレビューテキスト表示ロジック

対象外:
- LLM が生成するプレビュー本文の内容
- 試合詳細ページのテキスト表示

## 変更内容

### 現状

```ts
// 文字数で単純切り詰め
const preview = text.slice(0, 120) + '...';
```

### 修正後

日本語の文末（`。`・`！`・`？`）で切り詰める。
`maxLength` 文字以内で最後の文末句点を探し、見つかればそこで切る。
見つからない（最初の文が長すぎる）場合は `maxLength` でフォールバック。

```ts
function truncateAtSentenceBoundary(text: string, maxLength = 120): string {
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    candidate.lastIndexOf('。'),
    candidate.lastIndexOf('！'),
    candidate.lastIndexOf('？'),
  );
  if (lastSentenceEnd > maxLength * 0.5) {
    return text.slice(0, lastSentenceEnd + 1);
  }
  return candidate + '…';
}
```

`maxLength` はカードデザインに合わせて調整する（現在 120 文字前後を想定）。

## 変更ファイル

- `components/match-card.tsx`（またはプレビューテキストを表示するコンポーネント）
- `lib/text.ts`（共通ユーティリティとして `truncateAtSentenceBoundary` を定義する場合）

## 受け入れ条件

- [ ] 試合一覧のすべてのプレビューテキストが文末（`。`）で終わる
- [ ] 最初の文が `maxLength` を超える場合は `…` で終わる（文中切断でない）
- [ ] テキストが `maxLength` 以内の場合はそのまま全文表示される
- [ ] 既存のプレビューテキストの表示幅・行数に大きな変化がない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. `maxLength` の最適値（現在 120 文字の想定が妥当かどうか）
2. 英語コンテンツ（プレミアシップ等で英語プレビューが混在する場合）の区切り文字対応
