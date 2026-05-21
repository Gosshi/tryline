# PR #99 — ペイウォール分割ロジックに H2 fallback を追加

## 背景

`components/match-content.tsx` の `splitAtSecondHeading` は
H1（`#`）見出しが 2 つ見つかったところでコンテンツを分割するが、
H1 を持たず H2（`##`）のみで構成されたレビュー記事（253 件）とプレビュー（3 件）では
分割されず全文が無料表示になるバグがある。

DB のコンテンツ構造:

| 構造 | 件数 | ペイウォール |
|------|------|------------|
| H1 × 2 | 234 件 | ✅ 動作中 |
| H1 × 3 | 425 件 | ✅ 動作中 |
| H2 × 3 のみ | 76 件 | ❌ 全文無料 |
| H2 × 4 のみ | 180 件 | ❌ 全文無料 |

## スコープ

対象:
- `components/match-content.tsx`

対象外:
- DB コンテンツの変更なし
- `generate-recap.ts` の追加変更なし（PR #98 で対応済み）

---

## 変更仕様

`splitAtSecondHeading` 関数を以下のロジックに変更する:

```ts
function splitAtSecondHeading(blocks: MarkdownBlock[]): {
  free: MarkdownBlock[];
  locked: MarkdownBlock[];
} {
  // 1st pass: H1 が 2 つあれば 2 つ目で分割（既存ロジック）
  let h1Count = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block?.type === "heading" && block.level === 1) {
      h1Count++;
      if (h1Count === 2) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }

  // fallback: H1 が足りない場合は H2 の 2 つ目で分割
  let h2Count = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block?.type === "heading" && block.level === 2) {
      h2Count++;
      if (h2Count === 2) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }

  return { free: blocks, locked: [] };
}
```

### 動作結果

- **H1 × 2 以上の記事**: 2 つ目の H1 で分割（変更なし）
- **H2 のみの記事**: 1 つ目の H2 セクション（例: 試合全体像）が無料、2 つ目（例: ターニングポイント）以降が locked

---

## 完了の定義

- [ ] `splitAtSecondHeading` が上記ロジックに変更されている
- [ ] TypeScript エラーなし・`pnpm build` 通過
- [ ] H2 構造のレビューページで 2 つ目の H2 以降がペイウォールで隠れること
