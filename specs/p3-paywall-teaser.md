# Paywall テザー：次のセクション見出しをチラ見せ

## 背景

`match-content.tsx` は 300 文字で本文を切り、グラデーションフェード + Premium CTA を表示する。
ロック領域に何があるかが見えないため「続きを読みたい」という動機が生まれにくい。
次のセクション名をチラ見せすることで升格率を高める。

## スコープ

- 対象: `components/match-content.tsx` — 非 Premium ユーザー向けロック表示
- 対象外: Premium ユーザーの表示、`paywall.tsx` コンポーネント

## 変更内容

### ロジック

`MatchContent` 内で、非 Premium 時に以下を追加する:

1. `content.contentMdJa` 全体を `parseMarkdown` でパース（既存関数を流用）
2. 300 文字以降のブロック群の中から、最初の `type === "heading"` ブロックを探す
3. 見つかった場合、グラデーションフェードの直前にセクション名を表示する

### UI 表現

グラデーション (`h-24 bg-gradient-to-t from-white`) の直上に追加:

```tsx
{nextHeading && (
  <p className="text-xs font-semibold tracking-[0.15em] text-slate-400 uppercase">
    次のセクション
    <span className="ml-2 normal-case text-[var(--color-ink-muted)]">
      {nextHeading.text} →
    </span>
  </p>
)}
```

このテキストはグラデーションに隠れないよう、グラデーション `div` の**外側・直前**に配置する。

### 実装のポイント

- `FREE_CONTENT_LIMIT = 300` を超えた全ブロックのうち最初の heading を探す
- heading が存在しない場合はテザーを表示しない（現状と同じ UI）
- heading テキストは plain text で表示してよい（マークアップ不要）

## 変更ファイル

- `components/match-content.tsx`

## 受け入れ条件

- 非 Premium ユーザーが recap/preview を閲覧したとき、ロック領域に見出しが存在すれば「次のセクション: ◯◯ →」が表示される
- 見出しが存在しない場合はテザーが出ない（既存 UI を維持）
- Premium ユーザーには一切表示されない
- グラデーションフェードと重ならない
