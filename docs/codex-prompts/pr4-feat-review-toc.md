# feat: レビュー・プレビュー本文に目次（TOC）を追加

## 目的

試合詳細ページの長文レビュー・プレビュー本文の先頭に、
セクション見出しへのジャンプリンクを表示する。
モバイルで長文を読む際のナビゲーション改善が主目的。

## 実装の流れ

`components/match-content.tsx` のみを変更する。

### 1. 見出し id 生成ヘルパーを追加

```ts
function toHeadingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w぀-ヿ一-鿿-]/g, "")
    .slice(0, 60);
}
```

### 2. `renderBlock` の heading ケースに `id` を付与

level <= 1 の `<h3>` に `id={toHeadingId(block.text)}` を追加する。

```tsx
return (
  <h3
    id={toHeadingId(block.text)}
    className="border-l-2 border-[var(--color-accent)] pl-3 font-serif text-lg font-bold text-[var(--color-ink)]"
    key={index}
  >
    {renderInline(block.text)}
  </h3>
);
```

### 3. `MatchContent` に TOC を追加

`type === "heading"` かつ `level <= 1` のブロックが **2 件以上** あるときのみ描画する。
TOC は本文 `<div>` の直前に配置する。

```tsx
export function MatchContent({ content }: MatchContentProps) {
  const blocks = parseMarkdown(content.contentMdJa);
  const headings = blocks.filter(
    (b): b is Extract<MarkdownBlock, { type: "heading" }> =>
      b.type === "heading" && b.level <= 1,
  );

  return (
    <>
      {headings.length >= 2 && (
        <nav
          aria-label="目次"
          className="mb-6 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            目次
          </p>
          <ol className="space-y-1">
            {headings.map((h, i) => (
              <li key={i}>
                <a
                  className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline"
                  href={`#${toHeadingId(h.text)}`}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="space-y-5 text-[var(--color-ink)]">
        {blocks.map(renderBlock)}
      </div>
      <p className="mt-6 text-xs text-slate-500">
        <time dateTime={content.generatedAt}>
          {formatGeneratedAtJst(content.generatedAt)}
        </time>
      </p>
    </>
  );
}
```

## 変更するファイル

- `components/match-content.tsx` のみ
  - `toHeadingId` ヘルパー関数を追加
  - `renderBlock` の `heading` (level <= 1) ケースに `id` 属性を付与
  - `MatchContent` の return に TOC `<nav>` を追加

## 変更しないこと

- `components/match-content-section.tsx`
- `lib/match-content/` 配下のすべて
- データクエリ・ページコンポーネント

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- レビュー本文に見出しが 2 件以上ある場合、本文の上に目次が表示されること
- 目次の各リンクをクリックすると対応する見出しにスクロールすること
- 見出しが 0〜1 件の場合は目次が表示されないこと

## ブランチ・PR

- ブランチ: `feat/review-toc`
- PR タイトル: `Feat: add table of contents to match review/preview content`
