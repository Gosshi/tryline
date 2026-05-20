# PR #88 — アコーディオン デフォルト展開改善

## 背景

Premiership・URC・Super Rugby Pacific・League One の大会ページは
10節以上あると折りたたみ（アコーディオン）モードに入る。
現状は「現在の節」1つだけが開いた状態でランディングするため、
初回訪問者にはコンテンツがほぼ見えない。

`components/season-match-groups.tsx` の `getDefaultOpenGroupIndex` が
「直近の完了節 + 1」を返すロジックは正しいが、
開くのが1節のみのためページを開いた瞬間のスキャナビリティが低い。

## スコープ

対象:
- `components/season-match-groups.tsx`

対象外:
- Six Nations・Top 14 は折りたたみモードに入らない（10節未満）ので変更不要

---

## 変更仕様

### 初期表示で開く節を最大3つにする

`openIndexes` の初期値を「デフォルト開くインデックス1件」から
「デフォルト開くインデックス ± 1」の最大3件に変更する。

`getDefaultOpenGroupIndex` で求めた index を `center` として、
`center - 1`（直前節）、`center`（現在節）、`center + 1`（次節）を
初期 open セットに含める。
範囲外のインデックス（`< 0` や `>= groupedMatches.length`）は除外する。

`useState` の初期化部分（`components/season-match-groups.tsx:74` 付近）を
以下に置き換える:

```ts
const [openIndexes, setOpenIndexes] = useState<Set<number>>(() => {
  if (!collapsible) {
    return new Set(groupedMatches.map((_, i) => i));
  }

  if (defaultOpenIndex < 0) {
    return new Set([0]);
  }

  return new Set(
    [defaultOpenIndex - 1, defaultOpenIndex, defaultOpenIndex + 1].filter(
      (i) => i >= 0 && i < groupedMatches.length,
    ),
  );
});
```

### URC 2025-26 で全節が閉じている問題への対処

`getDefaultOpenGroupIndex` は将来試合のみの場合 `completedIndex = -1` → `return 0` を返す。
しかし `collapsible && defaultOpenIndex >= 0 ? new Set([defaultOpenIndex]) : ...` という
現状の条件式で `defaultOpenIndex = 0` の場合、第1節のみが開く。

上記の置き換えにより `defaultOpenIndex = 0` でも
「第1節・第2節」が初期表示で開くようになる。
また `defaultOpenIndex < 0`（= -1）の場合は `new Set([0])` を返す保護も追加する。

---

## 完了の定義

- [ ] Premiership・URC・Super Rugby・League One の大会ページで
      ランディング時に直近3節（前後含む）が展開済みで見える
- [ ] 折りたたみボタンは引き続き動作する（手動で開閉できる）
- [ ] Six Nations・Top 14 の表示は変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
