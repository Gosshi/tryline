仕様書 `specs/fix-generation-event-integrity-gate.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**イベント合計と最終スコアの不一致を検出しているのに、生成が止まっていません。**

`lib/llm/pipeline.ts:204-235` は不一致を検出して `console.warn` と `logPipelineRun({ stage: 0, status: "failed" })` を実行しますが、**そのまま次の処理に進んで、汚染されたイベントを根拠に本文を生成します。**

`lib/llm/stages/assemble.ts:924` のゲートは `derived_stats` を null にするだけで、`score_timeline` と `match_events` は入力に残ります。`generate-recap.ts:163` は「スコアリングイベントは以下のデータのみを根拠に記述すること」、L167 は「# ターニングポイントの骨格として必ず使うこと」と指示するので、**別試合のイベントが本文の唯一の根拠になります。**

## これは実装の不備ではありません

`specs/fix-score-event-integrity-check.md` の当初スコープが「検知・記録」までで、`specs/fix-derived-stats-event-integrity-gate.md` は `score_timeline` を明示的に対象外にしていました。**仕様の防御範囲が足りなかった**ので、今回それを広げます。両 spec の既存実装は残してください。

## 触るファイル

```
lib/llm/pipeline.ts
lib/llm/stages/assemble.ts
lib/llm/notify.ts
```

## 実装の形

**`lib/llm/pipeline.ts:236-243` に既にある「recap でイベント0件なら `status: "skipped"` を返す」防御と同じ形にしてください。** 新しい status を増やす必要はありません。

## 適用条件を間違えないでください

`eventTotalsMatchFinalScore` は **`status` が finished でない試合やスコアが null の試合でも false を返します。それは「不整合」ではありません。**

本ゲートの適用は **`contentType === "recap"` かつ finished かつ `home_score` / `away_score` が両方非 null のときだけ**です。試合前の preview 生成を壊したら差し戻します。

## 変えてはいけないもの

- `lib/llm/prompts/generate-recap.ts` の `PROMPT_VERSION`（プロンプト文字列を変えないので不要）
- `lib/llm/content-length.ts`（字数要件には触れません）
- `match_events` / `match_content`（DELETE / UPDATE を作らない）

## 通知について

止めたことを Discord に出すとき、**件数だけにしないでください。** match_id と `https://www.trylinerugby.com/matches/<id>` を含めてください。

`lib/llm/notify.ts:209` の週次監査通知が `2. スコア不一致: matches=${count}` という件数だけだったため、**この不一致は 2026-08-17 以降ずっと検出されていたのに気づかれませんでした。** 同じ失敗を繰り返さないでください。
