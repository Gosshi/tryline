# AI レビューサンプルの Markdown 記法除去

## 背景

ホームページの「AI レビューのサンプル」セクションで、
レビューの冒頭 120 字を `<p>` タグにそのまま表示している。

レビューは Markdown 形式（`# 試合全体像` 等）で生成されるため、
`#` や `**` がそのまま表示されてしまう。

## スコープ

対象:
- `lib/db/queries/matches.ts` — `getRecentlyReviewedMatches` 内の `recapExcerpt` 生成箇所（L298付近）

対象外:
- 試合詳細ページのレビュー本文（別途 Markdown レンダリング済み）

## 変更内容

`recapExcerpt` を生成する前に Markdown 記法を除去する関数を追加・適用する。

### 除去対象

- 見出し: `# `, `## `, `### ` 等（行頭の `#` と空白）
- 箇条書き: 行頭の `- ` または `* `
- 太字: `**text**` → `text`
- 連続空行の圧縮

### 実装例

```ts
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

`truncateAtSentenceBoundary` を呼ぶ前に `stripMarkdown(row.content_md_ja)` を適用する:

```ts
recapExcerpt: truncateAtSentenceBoundary(stripMarkdown(row.content_md_ja), 120),
```

## 受け入れ条件

- [ ] ホームページのサンプルレビューに `#`・`**` 等の記号が表示されない
- [ ] 120 字前後のプレーンテキストとして自然に読める
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
