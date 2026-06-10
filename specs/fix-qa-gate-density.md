# fix-qa-gate-density

## 背景

PMF 監査（2026-06-10）で 6 月 recap の `information_density` 平均が 3.72 → 2.96 に低下していることが判明した。
現状は `resolveVerdict` が「全スコア >= 3 なら publish」と判定するため、density=3 のコンテンツが published になる。
density=3 は「同じ内容の言い換えが多い・一般論が目立つ」水準であり、有料ユーザーに見せるべきでない。

また pipeline.ts には以下の 2 つの「強制 publish」パスがあり、`resolveVerdict` を経由しないため density チェックが迂回される：
- 改訂後の factual_grounding がベースラインより悪化した場合、ベースライン qa の verdict を "publish" に上書き（L373付近）
- 改訂後も content_length_issue が残る場合、"publish" に上書き（L401-408付近）

## スコープ

対象:
- `lib/llm/stages/qa.ts`: `resolveVerdict` 関数の publish 条件に density >= 4 を追加
- `lib/llm/pipeline.ts`: 強制 publish パス 2 箇所に density ガードを追加

対象外:
- QA プロンプト・スコアリングロジックの変更
- preview コンテンツへの適用（density ゲートは recap のみ。preview は現状の >= 3 を維持する）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

なし（pipeline の内部ロジック変更）。

## LLM 連携

パイプライン Stage 4（QA 評価）の後段で、コード側が verdict を決定するロジックを変更する。
LLM への追加呼び出しは不要。

## 変更詳細

### 1. `lib/llm/stages/qa.ts` — `resolveVerdict`

`DENSITY_PUBLISH_MIN = 4` 定数を追加。
`resolveVerdict` に `contentType: ContentType` 引数を追加し、recap の場合のみ density >= 4 を publish の必須条件にする。

現状の publish 条件:
```typescript
if (scoreValues.every((score) => score >= 3)) {
  return "publish";
}
```

変更後（recap は density >= 4 が必須）:
```typescript
const densityOk =
  contentType !== "recap" || scores.information_density >= DENSITY_PUBLISH_MIN;

if (scoreValues.every((score) => score >= 3) && densityOk) {
  return "publish";
}
```

density が低い recap は既存の retry/reject フローに流れる（retryCount >= 2 → reject）。

`resolveVerdict` を呼んでいる `parseQaResponse` に `contentType` を伝播する。

### 2. `lib/llm/pipeline.ts` — 強制 publish パスへの density ガード

`persistedStatus` を決定する L425 付近の直前に以下を追加する：

```typescript
const densityBlocked =
  contentType === "recap" &&
  language === "ja" &&
  (finalQa.scores.information_density ?? 0) < DENSITY_PUBLISH_MIN;

const persistedStatus =
  finalQa.verdict === "publish" && !densityBlocked ? "published" : "draft";
```

`DENSITY_PUBLISH_MIN` は `qa.ts` からエクスポートして pipeline が import することで定数を重複させない。

## 受け入れ条件

1. `resolveVerdict` に `contentType: "recap"`, `information_density: 3` を渡すと `"retry"` が返る
2. `resolveVerdict` に `contentType: "recap"`, `information_density: 4` を渡すと `"publish"` が返る（他スコアが >= 3 の場合）
3. `resolveVerdict` に `contentType: "preview"`, `information_density: 3` を渡すと `"publish"` が返る（ゲート対象外）
4. pipeline.ts で `finalQa.verdict === "publish"` かつ `contentType === "recap"` かつ `information_density < 4` の場合、`persistedStatus` は `"draft"` になる
5. 強制 publish パス（factual_grounding 後退時・length revision 後）も density < 4 なら draft になる
6. 既存テストが引き続き通過する

## 未解決の質問

なし。閾値 4 は Owner 確認済み（PMF 監査の指摘どおり）。
