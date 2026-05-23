# ホームページ: サンプルテキスト表示文字数を 120 → 350 字へ拡大

## 背景

ホームページの「最近のレビュー」カードと Premium ピッチセクションの
サンプルテキスト（`recapExcerpt`）は現在 120 字で切り捨てられており、
画面上では約 40〜60 字しか見えない状態。

ユーザーがコンテンツ品質を判断する前にテキストが途切れるため、
「続きを読みたい」という購買動機が生まれない。

目標: サンプルテキスト長を 350 字（文末まで）に拡大し、
有料登録前に価値を体感させることで Premium への転換率を高める。

## スコープ

対象:
- `lib/db/queries/matches.ts` — `truncateAtSentenceBoundary` の引数を 120 → 350 に変更
- `app/page.tsx` — ヒーローカードの `line-clamp-3` → `line-clamp-6` 相当に拡張
- `components/home-premium-pitch.tsx`（または同等コンポーネント）— サンプルセクションの `line-clamp-5` → `line-clamp-8` 相当に拡張

対象外:
- `getRecentlyReviewedMatches` の返却構造・型（`recapExcerpt: string` のまま）
- DB スキーマ・マイグレーション（なし）
- Premium 会員向け全文表示（変更なし）

## データモデル変更

なし

## API サーフェス

なし。`recapExcerpt` フィールドの型は `string` のまま。

## UI サーフェス

### `lib/db/queries/matches.ts`

```typescript
// 変更前（約 120 字で切断）
recapExcerpt: truncateAtSentenceBoundary(stripMarkdown(row.content_md), 120),

// 変更後（約 350 字で切断、文末まで延ばす）
recapExcerpt: truncateAtSentenceBoundary(stripMarkdown(row.content_md), 350),
```

### ホームヒーローカード（`app/page.tsx` 内のレビューカード部分）

```tsx
// 変更前
<p className="... line-clamp-3">{match.recapExcerpt}</p>

// 変更後
<p className="... line-clamp-6">{match.recapExcerpt}</p>
```

### Premium ピッチセクション内サンプル（`components/home-premium-pitch.tsx` 等）

```tsx
// 変更前
<p className="... line-clamp-5">{match.recapExcerpt}</p>

// 変更後
<p className="... line-clamp-8">{match.recapExcerpt}</p>
```

`line-clamp-*` の値は実装時に Codex がビジュアルを確認しながら調整すること。
重要なのは「350 字が途中で切れない」こと。

## LLM 連携

なし

## 受け入れ条件

1. ホームの「最近のレビュー」カードに 300 字以上のテキストが表示される
2. テキストが段落の途中ではなく文末（`。`）で切れている
3. Premium 会員は試合ページで全文を読める（変更なし）
4. `tsc --noEmit` でビルドエラーなし
5. Playwright でホームページのスクリーンショットを撮り、サンプルテキスト量を確認

## 未解決の質問

- `app/page.tsx` 内のレビューカードコンポーネント名を Codex が特定してから実装すること
- `line-clamp-*` の上限はビジュアル確認後に Codex が最終調整すること