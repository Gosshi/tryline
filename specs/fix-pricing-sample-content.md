# Pricing ページ: サンプルレビューの空欄修正

## 背景

`app/pricing/page.tsx` の「Premium のレビューはこんな内容です」セクションは
`getRecentlyReviewedMatches(1)` で取得したレビューの冒頭文を表示する。
`sample` が null の場合（公開済みレビューが 0 件のとき）は
「公開済みレビューを準備中です。」というフォールバックテキストが表示される。

評価時点（2026-05-23）でこのセクションが空欄になっており、
Pricing ページの CTA 効果が著しく低下していた。

原因の候補:
1. `match_content` に `language='ja'` かつ `status='published'` のレコードが 0 件
2. `content_md_ja` バグ（`fix-pipeline-language-column.md` 参照）により
   コンテンツが正しく保存されていない
3. `recapExcerpt` の文字列処理（`stripMarkdown` + `truncateAtSentenceBoundary`）が
   空文字を返している

本仕様書では「フォールバック自体を改善する」ことと「クエリ範囲を広げる」ことで
サンプルが表示される確率を最大化することを目的とする。
根本原因が #2 の場合は `fix-pipeline-language-column.md` を先に実装すること。

## スコープ

対象:
- `app/pricing/page.tsx` — サンプル取得クエリのフォールバック戦略とフォールバック UI
- `lib/db/queries/matches.ts` — `getRecentlyReviewedMatches` のクエリ条件見直し（language オプション追加）

対象外:
- コンテンツの手動入力・静的ハードコード（動的取得を維持する）
- 言語カラムバグの修正（`fix-pipeline-language-column.md` に分離）

## データモデル変更

なし

## API サーフェス

### `getRecentlyReviewedMatches` のシグネチャ拡張

```typescript
// 変更前
export async function getRecentlyReviewedMatches(
  limit = 3,
): Promise<RecentlyReviewedMatch[]>

// 変更後（language を省略したとき全言語が対象）
export async function getRecentlyReviewedMatches(
  limit = 3,
  language?: "ja" | "en",
): Promise<RecentlyReviewedMatch[]>
```

`language` を省略した場合はフィルタしない（`.eq("language", language)` を条件付きで適用）。

### `app/pricing/page.tsx` の変更

```typescript
// 変更前
getRecentlyReviewedMatches(1).then(([match]) => match)

// 変更後: ja 優先、0件なら言語問わずフォールバック
const jaMatch = await getRecentlyReviewedMatches(1, "ja").then(([m]) => m ?? null);
const sample = jaMatch ?? await getRecentlyReviewedMatches(1).then(([m]) => m ?? null);
```

## UI サーフェス

### フォールバック UI の改善

現在のフォールバック:
```tsx
<p className="text-sm text-[var(--color-ink-muted)]">
  公開済みレビューを準備中です。
</p>
```

改善後:
```tsx
<div className="space-y-3 text-sm text-[var(--color-ink-muted)]">
  <p className="font-semibold text-[var(--color-ink)]">試合直後に更新</p>
  <p>
    ノックアウト式の試合では、キックオフ後 30〜60 分で AI 日本語レビューが生成されます。
    プレビューは無料で読めます。レビュー全文と AI チャットは Premium 限定です。
  </p>
</div>
```

フォールバックが表示される場合でも価値を伝えるテキストを置く。

## LLM 連携

なし

## 受け入れ条件

1. `fix-pipeline-language-column.md` が実装済みであること（先決条件）
2. Pricing ページを開いたとき、`status='published'` の recap が 1 件以上存在する場合は
   必ずサンプルセクションにコンテンツが表示される
3. 公開済みレビューが 0 件の場合でも「公開済みレビューを準備中です。」の代わりに
   改善されたフォールバック UI が表示される
4. `getRecentlyReviewedMatches` に `language` 引数を渡さない既存の呼び出し箇所が
   引き続き動作する（後方互換性維持）
5. `tsc --noEmit` でビルドエラーなし
6. Playwright で Pricing ページのスクリーンショットを撮り、サンプルセクションが空欄でないことを確認

## 未解決の質問

- `fix-pipeline-language-column.md` のマイグレーション実施後に
  既存データのカラム名が正しく切り替わることを staging 環境で確認してから
  本仕様書の実装に着手すること
- `recapExcerpt` が空文字を返している場合（原因 #3）は
  `p9-sample-recap-markdown-strip.md` の修正と合わせて対処すること
