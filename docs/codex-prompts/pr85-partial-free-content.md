# PR #85 — 試合コンテンツの部分無料開放（SEO 強化）

## 背景

現状は `FREE_CONTENT_LIMIT = 300` で先頭 300 文字だけ非 Premium ユーザーに見せている。
300 文字は段落の途中でぶつ切りになるため、読み物として成立せず、
Google にも意味のあるコンテンツとして評価されにくい。

「試合を分けたポイント」という質の高いセクションを冒頭に見せることで、
AI コンテンツの品質を伝えつつ、課金への動機付けと SEO 流入の両方を狙う。

## スコープ

対象:

- `components/match-content.tsx`
- `lib/llm/stages/generate-narrative.ts`（プロンプトに「第1セクション」構成を明示）

対象外:

- `app/matches/[id]/page.tsx` — 変更不要
- `/en` ページ・英語コンテンツへの影響なし

---

## 1. `match-content.tsx` — ブロック境界でカット

### 変更前

```ts
const FREE_CONTENT_LIMIT = 300;

const contentMdJa = isLocked
  ? content.contentMdJa.slice(0, FREE_CONTENT_LIMIT)
  : content.contentMdJa;
const blocks = parseMarkdown(contentMdJa);
```

### 変更後

300 文字のスライスをやめ、**パース済みブロックを見出し単位でカット**する。
非 Premium ユーザーには最初の見出し（level <= 1 相当）とその直下のパラグラフ群を見せ、
次の見出しが来た時点でロックする。

```ts
const allBlocks = parseMarkdown(content.contentMdJa);

function splitAtSecondHeading(blocks: MarkdownBlock[]): {
  free: MarkdownBlock[];
  locked: MarkdownBlock[];
} {
  let headingCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === "heading" && blocks[i].level <= 1) {
      headingCount++;
      if (headingCount === 2) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }
  return { free: blocks, locked: [] };
}

const { free: freeBlocks, locked: lockedBlocks } = isLocked
  ? splitAtSecondHeading(allBlocks)
  : { free: allBlocks, locked: [] };

const blocks = isLocked ? freeBlocks : allBlocks;
const nextHeading = isLocked
  ? (lockedBlocks.find(
      (b): b is Extract<MarkdownBlock, { type: "heading" }> =>
        b.type === "heading",
    ) ?? undefined)
  : undefined;
```

`FREE_CONTENT_LIMIT` 定数は削除する。

---

## 2. `generate-narrative.ts` — 日本語プロンプトの第1セクション構成を明示

日本語 recap プロンプトの冒頭に以下を追加し、
**第1セクションが「試合の流れ・決定的瞬間」の概要**になるよう誘導する。

```
【重要】第1セクション（試合概要）は 250〜350 字で完結させること。
このセクションは無料公開エリアになる。
試合の結論（勝敗・スコア・最大のポイント）を簡潔にまとめる。
```

日本語 preview プロンプトも同様に第1セクションを「見どころ要約」として構成する。

---

## 完了の定義

- [ ] 非 Premium ユーザーが試合ページを開くと、第1セクション（見出し＋本文）が完全な形で読める
- [ ] 第2見出しの手前でフェードアウト＋「Premium で全文を読む」CTA が表示される
- [ ] Premium ユーザーの表示は変わらない
- [ ] `view-source` で第1セクションのテキストが HTML に含まれている（SSR 確認）
- [ ] TypeScript エラーなし・`pnpm build` 通過
