# Codex 指示書: 順位表の鮮度ゲートと Top 14 の自前計算

仕様書: `specs/fix-stale-standings-gate-and-top14-calculation.md`
受け入れ条件（1〜22）は仕様書を正とする。ここでは繰り返さない。

## 最初にやること: 作業ツリーを main に戻す

**PR #849 の変更が作業ツリーに残っている**（同じディレクトリを共有しているため）。
2026-09-22 時点の残存分:

```
 M lib/llm/prompts/generate-recap.ts
 M tests/llm/prompts/generate-recap.test.ts
```

**#849 は取り込まない。この spec が置き換える。** 上に積み上げないこと。
内容は PR #849 の head `89952ad` と一致することを確認済みなので、破棄して構わない。
`main`（`148d260`）から始めること。

仕様書が引用している行番号・文字列は**すべて main 基準**。
残存差分を見て「もう直っている」と判断しないこと。

## 直したいこと

本番の Top 14 順位表が**第1節時点のまま**止まっている（第3節終了後なのに全チーム `played=1`）。
これが読者に見えている順位表ページと recap の入力の両方を壊している。

**原因は Wikipedia のソース遅れで、パーサは正常。** 実取得して確認済み。
だからパーサは直さない。やることは2つ。

- **A**: 順位表がその試合をカバーしていないならプロンプトに渡さない
- **B**: Top 14 は Wikipedia をやめて自前計算する

## 触るファイル

- `lib/llm/prompts/shared-prompt-blocks.ts`
- `lib/llm/prompts/generate-recap.ts`
- `lib/llm/prompts/generate-preview.ts`
- `lib/llm/stages/assemble.ts`（消化試合数の算出を追加）
- `lib/llm/types.ts`（`AssembledContentInput` への追加）
- `scripts/calculate-standings.ts`
- `scripts/backfill-standings.ts` または `lib/ingestion/weekly-standings.ts`（top-14 を外す）
- `app/api/cron/ingest-standings/route.ts`
- テスト一式

`lib/scrapers/wikipedia-standings.ts` は触らない。パーサは正しい。

## A の要点

現状 `shared-prompt-blocks.ts:63-74` は**空かどうかしか見ていない**。

```ts
return standings.length === 0
  ? ""
  : [`現在の大会順位表（この試合前時点）: ${JSON.stringify(standings)}`, ...]
```

**やってはいけない実装**（#849 がこれをやって差し戻した）:

```ts
buildStandingsBlock(...).replace("この試合前時点", "この試合を終えた時点")
```

古い `played=1` を「この試合を終えた時点」と断言させるのは、より強い虚偽。
かつ共有ヘルパの文言が変われば `.replace` が黙って no-op になりバグが無言で復活する。
`buildStandingsBlock` は**既に `contentType` を受け取っている**ので引数で分岐すること。

チーム照合は**必ず `team_id` ベース**で、アセンブル側で行う。
`competition_standings` の行は `team_name` しか持たない（`lib/llm/types.ts:220-232`）。
Top 14 は表示名が DB と 14 中 4 件ずれる既知の罠があるので、プロンプト層で名前照合をしない。

## B の要点

`scripts/calculate-standings.ts` は既にあり**どこからも呼ばれていない**。
`match_events` の `type='try'` からトライを数える（`:209-211`）。
ペナルティトライは `type='try'` + `metadata.is_penalty_try=true` で保存されているので、
**トライ数としては1本として数えられる**。これは正しいので変えない。

`:130` の `if (triesFor >= 4)` が Top 14 では誤り。正しい規則は

> one competition bonus point awarded for a loss within seven points,
> and one bonus point also awarded for **scoring at least three tries more than the opponent**

`addMatchResult` は現在 `triesFor` しか受け取らない。**相手のトライ数を渡せるようにする**。

さらに `:130` は**勝敗に関係なく加算している**。引き分け時の扱いは AC 11 を参照
（一次資料を確認すること。Wikipedia の要約文だけを根拠にしない）。

### テストケース（実測値。そのまま使うこと）

| 試合 | home tries | away tries | 標準(4本以上) | Top 14(差3以上) |
|---|---:|---:|---|---|
| Castres 29-27 Toulon | 4 | 4 | 両チーム | どちらも無し |
| Lyon 40-36 Clermont | 4 | 5 | 両チーム | どちらも無し |
| Vannes 23-29 Toulouse | 2 | 4 | away のみ | どちらも無し |
| Pau 70-28 Bayonne | 10 | 4 | 両チーム | home のみ |

### 上書きの罠（必ず塞ぐ）

`SUPPORTED_FAMILIES`（`scripts/backfill-standings.ts`）に **`top-14` が入っている**。
自前計算を入れても**毎週月曜の Wikipedia 取り込みが古い値で上書きする**。
どちらが権威かをコードで一意に決め、**両方が書き込む状態を残さないこと**。

## 処理すべきエッジケース

1. 順位表に片方のチームの行が無い → ゲートする（AC 7）
2. `played` が `expectedPlayed` を**上回る** → ゲートしない（AC 6）
3. `competition_standings` が空配列 → 現行どおり空文字（AC 8）
4. 対象大会に `match_events` が0件の finished 試合がある → 計算中止。
   **黙って0トライとして計算しない**（AC 12）
5. preview と recap で `expectedPlayed` の不等号が違う（preview は `<`、recap は `<=`）
6. Wikipedia 取り込みが throw しても自前計算は実行される（AC 14）

## やってはいけないこと

- `.replace()` で共有ヘルパの戻り値を加工すること
- 古い順位表にラベルを付け替えて済ませること。カバーしていないなら**渡さない**
- Top 14 以外の大会の規則を推測で変えること。既定の挙動は変えない（AC 10）
- 引き分け時のボーナスを Wikipedia の要約文だけを根拠に実装すること。
  確認できなければ実装せず、未解決として PR 本文に明記する
- `lib/scrapers/wikipedia-standings.ts` を直すこと。パーサは正常
- 新しいテストを、修正前でも通る形で書くこと

## 完了の定義

- 仕様書の受け入れ条件 1〜22 をすべて満たす
- **AC 3 / 4 / 7 / 9 / 12 / 13 のテストが修正前のコードで落ちることを先に確認**し、
  どう落ちたかを PR 本文に書く
- **順位表を含むフィクスチャを新設する**。
  既存の基本フィクスチャ（`tests/llm/prompts/generate-recap.test.ts:28`）は
  `competition_standings: []` なので、それだけでは AC 1 / 3 / 5 / 6 / 7 が素通りする
- 見出し名を変えた場合、`tests/llm/prompts/generate-recap.test.ts:254-255` を同時に更新し、
  更新箇所を PR 本文に列挙する
- `pnpm vitest run tests/llm tests/scripts` が全緑
- `pnpm tsc --noEmit` / `pnpm lint` が通る
- `gh pr checks` で CI の緑を確認してから完了報告する
