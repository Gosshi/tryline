# ペイウォール位置を見出しベースに変更（recap 無料範囲を試合全体像まで拡大）

## 背景

現状の recap 無料公開は `FREE_RECAP_CHAR_LIMIT = 450` 文字で機械的に切断している（`components/match-content.tsx`）。
試合全体像（400〜500字）の途中で切れ、「ターニングポイント」は先頭数文だけ見えて gate になる。

問題:
1. **文章の途中での切断** — 読者の離脱ポイントになる。
2. **無料の価値が伝わらない** — 分析の本体（試合全体像）を最後まで読ませた方が「続きを読みたい」動機が生まれる。
3. **有料の境界が不明瞭** — 「ターニングポイント」見出しで明確に切ることで、有料で得られるものが分かりやすくなる。

recap の構造（`recap@4.4.0`）:
```
# この試合の核心    ← 無料（200字以内）
# 試合全体像        ← 無料（400〜500字）全文
# ターニングポイント ← 有料（ここから gate）
# MOM / 次戦への示唆 ← 有料
```

既存の `fix-paywall-position.md` は文字数をずらす微調整 spec（旧）。
本 spec は見出しベース分割への根本的な変更であり、別課題として扱う。

## スコープ

対象:
- `components/match-content.tsx` — `splitAtFreeRecapLimit` を `splitRecapAtThirdHeading` に置き換え

対象外:
- preview のペイウォール位置（`splitAtSecondHeading` のまま変更なし）
- 有料機能の種類（recap 全文・AI チャット）は変更なし

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

**変更前:**
```
[無料] # この試合の核心 ＋ 試合全体像（450字まで途中切断）
[有料] 試合全体像の続き ＋ ターニングポイント ＋ MOM ＋ 次戦
```

**変更後:**
```
[無料] # この試合の核心（全文）＋ # 試合全体像（全文）
[有料] # ターニングポイント ＋ # MOM ＋ # 次戦への示唆
```

- 「次のセクション: ターニングポイント →」の予告表示はそのまま残る。
- fade-out グラデーション・CTA ボタンは変更なし。

## 変更詳細

### `components/match-content.tsx`

`FREE_RECAP_CHAR_LIMIT` 定数と `splitAtFreeRecapLimit` 関数を削除し、
`splitRecapAtThirdHeading` 関数を追加する。

```typescript
// 削除: const FREE_RECAP_CHAR_LIMIT = 450;
// 削除: function splitAtFreeRecapLimit(...) { ... }

// 追加
function splitRecapAtThirdHeading(blocks: MarkdownBlock[]): {
  free: MarkdownBlock[];
  locked: MarkdownBlock[];
} {
  let h1Count = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block?.type === "heading" && block.level === 1) {
      h1Count += 1;

      if (h1Count === 3) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }

  return { free: blocks, locked: [] };
}
```

`MatchContent` 内の分岐を変更:

```typescript
// 変更前
const { free: freeBlocks, locked: lockedBlocks } = isLocked
  ? contentType === "recap"
    ? splitAtFreeRecapLimit(allBlocks)
    : splitAtSecondHeading(allBlocks)
  : { free: allBlocks, locked: [] };

// 変更後
const { free: freeBlocks, locked: lockedBlocks } = isLocked
  ? contentType === "recap"
    ? splitRecapAtThirdHeading(allBlocks)
    : splitAtSecondHeading(allBlocks)
  : { free: allBlocks, locked: [] };
```

### データスパースモード（H1 が少ない recap）

`hasEvents=false` の recap は構造が異なり H1 が5つ存在する（この試合の核心・試合全体像・大会文脈・両チーム近況・次戦）。
この場合も同じロジックで3つ目の H1 以降を gate し、「この試合の核心 + 試合全体像」まで無料になる。
H1 が2つ以下の場合は `locked` が空になり全文無料表示（フォールバックとして妥当）。

## 受け入れ条件

1. 未ログインユーザーが recap を持つ試合ページを開くと、`# 試合全体像` の全文が表示される。
2. `# ターニングポイント`（3つ目のH1）以降が gate される（fade-out + CTA）。
3. H1 が2つ以下の recap では `locked` が空になり全文無料表示。
4. preview のペイウォール位置は変更なし。
5. `splitRecapAtThirdHeading` のユニットテストを追加:
   - H1 が3つ以上 → 3つ目のH1以降が locked
   - H1 が2つ → locked が空
   - H1 が0（全段落）→ locked が空
6. `FREE_RECAP_CHAR_LIMIT` と `splitAtFreeRecapLimit` が削除されていること（grep で確認）。
7. `tsc --noEmit` でビルドエラーなし。

## 未解決の質問

- 無料範囲が拡大する（450字 → 約700字）。SEO と転換率の両面でメリットがあると判断しているが、Owner の意図と一致しているか確認。