# verify-entities: sourced_facts 由来の選手名が構造的に false positive になる問題を修正

## 背景

`specs/feat-entity-grounding-gate.md`（PR #467）のコードレビューで判明。`lib/llm/prompts/verify-entities.ts`（19行目）の照合プロンプトはモデルに「sourced_facts に同一人物が明確に含まれる場合も対応付けてよい」と指示しているが、コード側の判定（`lib/llm/stages/verify-entities.ts` 82-93行目、`parseEntityVerificationResponse` 内の `ungroundedSurfaces` フィルタ）は `matched_entity` が **許可リスト（`allowedEntities`、lineup/event由来のみ）に含まれる場合しか grounded と認めない**。実際に確認済み: `allowed` セットは `allowedEntities.map(...)` からのみ構築されており、`sourcedFacts` 引数は照合判定に一切使われていない。

つまり sourced_facts だけに登場する選手（例: 負傷ニュース記事に載っている選手名）を本文が正当に言及すると、モデルがどう答えても機械的に違反扱いになる: モデルが `matched_entity` に選手名を返しても、その名前は `allowedEntities` に無いため `allowed.has(...)` が false → 違反 → `factual_grounding: 1` → hard block → retry 3回 → draft 落ち。生成プロンプト側（`generate-preview.ts` 222行目付近「選手名は入力データ（projected_lineups・match_events・sourced_facts）に含まれるものだけを使用すること」）は sourced_facts を正当な情報源として認めているため、**生成プロンプトと検証ロジックが正面衝突している**。

**現状の実害**: ほぼ無い。`sourced_facts` は現在 `isSourcedFactsEnabledForMatch`（`lib/llm/sourced-facts/fetch.ts` 72-88行目）により league-one とプレーオフ系ラウンドのみ有効化されており、本番全期間で11件（全て2026年6月）しか存在しないため、この不整合はまだほとんど発火していない。ただし sourced_facts の対象拡大（国際大会等への拡張）を行う場合、この不整合が真っ先に問題化する。**sourced_facts の対象拡大より先に本specを実施すること**。

## スコープ

対象:
- `lib/llm/stages/verify-entities.ts`: `parseEntityVerificationResponse` の判定ロジックに、`matched_entity` が `allowedEntities` に無い場合でも、正規化した文字列が `sourcedFacts` の `fact` 原文（連結・正規化済み）に部分一致する場合は grounded として扱う分岐を追加する
- `lib/llm/prompts/verify-entities.ts`: プロンプトに「sourced_facts で対応付ける場合、`matched_entity` には sourced_facts 原文中の表記をそのまま返すこと」と明示する（モデルが返す文字列がsourced_factsの原文と部分一致しやすくするため）
- 対応するテスト

対象外:
- `sourced_facts` の対象大会拡大自体（別spec・別判断）
- `allowed-entities.ts`（`buildAllowedPersonEntities`）への sourced_facts 由来エンティティの事前抽出追加（設計文書で「事前の人名抽出はしない、原文渡しのみ」と決定済み。この方針は維持する）

## データモデル変更

なし。

## LLM 連携

- `verify-entities.ts` の `PROMPT_VERSION`（`entity-verification@1.0.0`）をバンプすること
- コスト影響なし（同一の照合呼び出し内での判定ロジック変更のみ）

## 実装方針（提案）

```typescript
function factSupportsMatchedEntity(
  matchedEntity: string,
  sourcedFacts: SourcedFactInput[],
): boolean {
  const normalized = normalizeName(matchedEntity);
  const factsText = sourcedFacts
    .map((f) => f.fact)
    .join(" ")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");

  return factsText.includes(normalized);
}
```

`ungroundedSurfaces` のフィルタ内で、`!allowed.has(normalizeName(mention.matched_entity))` が true の場合でも、`factSupportsMatchedEntity(mention.matched_entity, sourcedFacts)` が true なら grounded 扱いにする（`sourcedFacts` を `parseEntityVerificationResponse` の引数に追加する必要がある）。

正確な正規化・部分一致の精度はCodexが既存パターン（`lib/content/fabrication-guard.ts` の `factSupportsSignal` 等）を参考に調整してよい。

**注意（過剰許可の防止）**: `matched_entity` が極端に短い文字列の場合、fact 原文への部分一致が偶発的に成立しやすい（例: 短い姓が無関係な単語の一部にヒットする）。最小長ガード（例: 正規化後4文字未満は sourced_facts 部分一致の対象外とし、`allowedEntities` 照合のみに限定する）を入れること。閾値は Codex 判断で調整してよいが、ガード自体は必須とし、受け入れ条件2のテストに「短い文字列が偶発一致で grounded にならない」ケースを含めること。

## 受け入れ条件

1. `sourced_facts` にのみ存在する選手名（`allowedEntities` には含まれない）を本文が言及し、モデルがその名前を `matched_entity` として返した場合、`ungroundedSurfaces` に含まれない（violationにならない）ことを単体テストで確認する
2. `sourced_facts` にも `allowedEntities` にも存在しない選手名は、引き続き `ungroundedSurfaces` に含まれる（violationのまま）ことを確認する
3. `sourced_facts` が空配列の場合の挙動は変更前と同じ（既存テストが壊れない）
4. `pnpm test`・`pnpm tsc --noEmit` 通過

## 未解決の質問

- 部分一致の精度（`fact` 原文の連結・正規化方法）は `fabrication-guard.ts` の既存パターンとの整合性を優先し、Codexの判断で調整してよい
