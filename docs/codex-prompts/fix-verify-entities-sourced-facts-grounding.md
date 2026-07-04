`/specs/fix-verify-entities-sourced-facts-grounding.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/llm/stages/verify-entities.ts`（`parseEntityVerificationResponse`関数、82-93行目付近の`ungroundedSurfaces`フィルタ）と `lib/llm/prompts/verify-entities.ts`（プロンプト文言）
- 参考パターン: `lib/content/fabrication-guard.ts` の `factSupportsSignal`（正規化・部分一致による対応付けの既存実装）
- これは `specs/feat-entity-grounding-gate.md`（PR #467、マージ済み）のコードレビューで発見されたHIGH指摘。ガード自体の設計は正しく、判定ロジックの1つの分岐が欠けているだけ

入出力の例:
- 現状: `allowedEntities: []`（確定lineup/event無し）、`sourcedFacts: [{fact: "選手Xが負傷離脱", ...}]` の状態で、本文が「選手X」に言及し、モデルが `matched_entity: "選手X"` と返しても、`allowed.has("選手X")`がfalseのため違反扱いになる
- 変更後: `matched_entity`が`allowedEntities`に無くても、`sourcedFacts`の`fact`原文（正規化済み）に部分一致すれば grounded 扱いになり、違反にならない
- 対照ケース: `sourcedFacts`にも`allowedEntities`にも無い名前は引き続き違反のまま

処理すべきエッジケース:
- `sourcedFacts`が空配列の場合、既存の挙動（allowedEntitiesのみで判定）から変わらないこと
- 正規化・部分一致のロジックは`fabrication-guard.ts`の既存パターンとの整合性を優先すること
- **最小長ガード（必須）**: `matched_entity` が極端に短い文字列の場合、fact 原文への偶発的な部分一致が成立しやすい。正規化後4文字未満（閾値はCodex判断で調整可）は sourced_facts 部分一致の対象外とし、短い文字列が偶発一致で grounded にならないテストケースを含めること（spec「実装方針」の注意書き参照）

完了の定義:
- specの受け入れ条件4項目すべてを満たす
- `pnpm test`・`pnpm tsc --noEmit` 通過
- `PROMPT_VERSION`(`entity-verification@1.0.0`)をバンプすること

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（sourced_facts対象拡大自体、allowed-entities.tsへの事前抽出追加）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- `PROMPT_VERSION`を何に変更したか明記する
- Owner への未解決の質問があれば記載する
