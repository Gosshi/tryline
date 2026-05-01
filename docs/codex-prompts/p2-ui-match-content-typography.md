# Codex Prompt: プレビュー・レビューコンテンツの見出しタイポグラフィ強化

## 前提

`p2-design-tokens.md` が完了していること（`--color-ink`、`--color-accent`、`--font-noto-serif-jp` が利用可能）。

---

## 背景

現在の `components/match-content.tsx` では、マークダウンの見出し（`h3`）が `text-lg font-semibold`、本文段落（`p`）が `leading-7` で描画されており、視覚的な重みがほぼ同じ。AIが生成したレビューには「試合総体」「ターニングポイント」「MOM選出と根拠」「次への示唆」などのセクション見出しが含まれるが、これらが本文に埋もれて長文が「壁」に見える。

見出しに視覚的な重みとアクセントを与え、長文コンテンツを読みやすくする。

---

## 変更対象ファイル

`components/match-content.tsx` のみ

---

## Task 1 — `renderBlock` の heading レンダリングを更新

### 変更前

```tsx
function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    if (block.level <= 1) {
      return (
        <h3 className="text-lg font-semibold" key={index}>
          {renderInline(block.text)}
        </h3>
      );
    }

    return (
      <h4 className="text-base font-semibold" key={index}>
        {renderInline(block.text)}
      </h4>
    );
  }
```

### 変更後

```tsx
function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    if (block.level <= 1) {
      return (
        <h3
          className="border-l-2 border-[var(--color-accent)] pl-3 font-serif text-lg font-bold text-[var(--color-ink)]"
          key={index}
        >
          {renderInline(block.text)}
        </h3>
      );
    }

    return (
      <h4
        className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]"
        key={index}
      >
        {renderInline(block.text)}
      </h4>
    );
  }
```

**変更のポイント:**
- `h3`（主要セクション見出し）: 左に 2px のエメラルドアクセントボーダー + `pl-3` + `font-serif` + `font-bold`
  - 「試合総体」「ターニングポイント」などの大見出しがエディトリアルに際立つ
- `h4`（サブ見出し）: `uppercase tracking-[0.12em]` のスモールキャプション風スタイルで本文と差をつける

---

## Task 2 — 段落の行間を日本語最適化

### 変更前

```tsx
  return (
    <p className="leading-7" key={index}>
      {renderInline(block.text)}
    </p>
  );
```

### 変更後

```tsx
  return (
    <p className="leading-[1.9] text-[var(--color-ink)]" key={index}>
      {renderInline(block.text)}
    </p>
  );
```

**変更のポイント:**
- `leading-7`（固定 28px）→ `leading-[1.9]`（相対値）: 日本語長文に適した行間
- `text-[var(--color-ink)]` を明示してデザイントークンに統一

---

## Task 3 — コンテンツ全体の余白とベースカラーを統一

### 変更前

```tsx
<div className="space-y-4 text-slate-900">{blocks.map(renderBlock)}</div>
```

### 変更後

```tsx
<div className="space-y-5 text-[var(--color-ink)]">{blocks.map(renderBlock)}</div>
```

**変更のポイント:**
- `space-y-4` → `space-y-5`: ブロック間余白を広げ、見出し直後のゆとりを確保
- `text-slate-900` → `text-[var(--color-ink)]`: デザイントークンに統一

---

## 完了条件

- [ ] レビューの主要見出し（「試合総体」等）が左にエメラルドのアクセントボーダー付きで表示される
- [ ] サブ見出しが uppercase + tracking で本文と明確に区別される
- [ ] 日本語段落が `leading-[1.9]` で読みやすく描画される
- [ ] マークダウンのパースロジック（`parseMarkdown`、`parseInline`）は変更しない
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `parseMarkdown`・`parseInline`・`renderInline` の実装
- リスト（`ul/li`）・テーブルのレンダリングスタイル
- `formatGeneratedAtJst` と生成日時の表示
- `components/match-content-section.tsx` のカードコンテナ
