# fix: Pacific Nations Cup ラウンド番号の修正

## 問題

`/c/pacific-nations-cup/2025` ページで全試合が「節未定」と表示される。
`round` カラムが全試合 `null` になっているため。

## 原因

`lib/scrapers/wikipedia-pacific-nations-cup-results.ts` の `wrapVeventsWithFixturesSection` が
全 vevent を単一の `Fixtures` セクションに包み込んでいる。
`parseWikipediaSixNationsHtml` は `Round_(\d+)` 形式の h3 ID でラウンドを検出するため、
ラウンド情報が取れない。

## Wikipedia ページ構造

`https://en.wikipedia.org/wiki/2025_World_Rugby_Pacific_Nations_Cup`

```
h2: Pool_stage
  h3: Pool_A   ← Pool A の試合 vevent が続く（3試合）
  h3: Pool_B   ← Pool B の試合 vevent が続く（3試合）
h2: Finals_series
  h3: Semi-finals   ← 2試合
  h3: Bronze_Final  ← 1試合
  h3: Grand_Final   ← 1試合
```

## 修正方針

`wrapVeventsWithFixturesSection` を廃止し、セクションごとに vevent を分類して
`parseWikipediaSixNationsHtml` が認識できる `Round_N` 形式のラッパーを生成する。

### ラウンド番号の割り当て

| セクション | ラウンド | 備考 |
|---|---|---|
| Pool_A・Pool_B 内の vevent（日付昇順 1 番目）| 1 | 同日の Pool A/B 試合は同ラウンド |
| Pool_A・Pool_B 内の vevent（日付昇順 2 番目）| 2 | |
| Pool_A・Pool_B 内の vevent（日付昇順 3 番目）| 3 | |
| Semi-finals 内の vevent | 4 | |
| Bronze_Final 内の vevent | 5 | |
| Grand_Final 内の vevent | 6 | |

### 実装の流れ

1. `$("div.mw-heading h3")` で各 h3 を走査し、id が `Pool_A`, `Pool_B`, `Semi-finals`, `Bronze_Final`, `Grand_Final` のものを検出
2. 各セクション内の `div.vevent.summary` を収集
3. Pool A/B の vevent は日付昇順でソートし、1-indexed でラウンド番号を付与（Pool A の 1 番目と Pool B の 1 番目は同じラウンド=1）
4. Finals の vevent はセクション名で固定ラウンドを付与
5. 各グループを `<div class="mw-heading mw-heading3"><h3 id="Round_N">Round N</h3></div>` + vevent HTML で包んで結合し、`parseWikipediaSixNationsHtml` に渡す

## 変更するファイル

- `lib/scrapers/wikipedia-pacific-nations-cup-results.ts`
  - `wrapVeventsWithFixturesSection` を上記ロジックに差し替え

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `node --env-file=.env.local tools/run-ts.cjs scripts/import-pacific-nations-cup-results.ts 2025` を実行してコンソールに `round: 1`, `round: 4` 等の値が含まれることを確認

## ブランチ・PR

- ブランチ: `fix/pacific-nations-cup-rounds`
- PR タイトル: `Fix Pacific Nations Cup round numbers`
