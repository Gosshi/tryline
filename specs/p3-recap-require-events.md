# Recap生成：イベントデータなし試合はスキップ

## 背景

`match_events` が空の試合でも recap が生成されており、LLM がスコアから「ペナルティが多発」等を推論して事実のように記述している。これは誤情報であり、コンテンツ品質を損なう。

## スコープ

対象: `contentType === "recap"` の生成パイプライン
対象外: preview 生成（試合前なので events は存在しない。変更なし）

## 変更箇所

### `lib/llm/pipeline.ts` — `generateMatchContent`

`assembleMatchContentInput` で `assembled` を取得した直後（stage1 ログの後）に以下のガードを追加する:

```ts
if (contentType === "recap" && assembled.match_events.length === 0) {
  return {
    matchId,
    contentType,
    status: "skipped",
    qa: null,
  };
}
```

`PipelineResult` 型に `status: "skipped"` と `qa: QaResult | null` を追加する（現状は `"published" | "draft"` のみ）。

### `lib/cron/orchestrate.ts` — `runOrchestrate`

`generateContent` の呼び出し結果が `status === "skipped"` の場合は `result.recaps.skipped` をインクリメントし、ログにも記録する。

### `lib/llm/prompts/generate-recap.ts`

`dataSparseBlock` の内容から試合展開の具体的推論（ペナルティ累積・接戦の終盤等）の記述を**削除**する。スパースモードは preview のみで使用する想定だが、万が一 recap が生成された場合の安全策として:

- 「詳細不明」「データがない」等の逃げ表現は一切禁止 → **削除**
- ペナルティ累積・接戦の終盤などの例示 → **削除**
- スパースモード時は「スコアと順位変動のみを記述し、試合展開の描写は行わないこと」に変更

## 受け入れ条件

- `match_events` が 0 件の試合で `generateMatchContent(matchId, "recap")` を呼ぶと、LLM 呼び出しが一切発生せず `status: "skipped"` が返る
- 既存の `match_events` ありの試合では動作変更なし
- orchestrate の `recaps.skipped` カウントにスキップ分が加算される
- preview 生成は影響を受けない

## 未解決の質問

- 既に公開済みの `match_events` なし recap（本試合のように推論で書かれたもの）は手動で非公開にするか、それとも再生成をトリガーするか？ → Owner 判断
