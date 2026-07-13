`/specs/fix-sourced-facts-stale-prompt-version-cache.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/llm/sourced-facts/fetch.ts` の `shouldUseCachedFacts()`（L96-123）と、その呼び出し元 `fetchSourcedFactsForMatch()`（L261-371、特にキャッシュ判定を行うL300-321）
- 実際に本番で発生した事例: 日本 vs アイルランド戦のsourced_factsが`prompt_version: "sourced-facts@1.2.0"`で取得されたまま、現行の`SEARCH_PROMPT_VERSION`（`"sourced-facts@1.3.0"`、反則数を明示的に要求）へのアップグレード後も再取得されず、recap生成時に反則数の根拠データが存在しなかった

入出力の例:
- 修正前: `contentType: "recap"`かつ`fetchedAt`が存在すれば、キャッシュされたfactの`metadata.prompt_version`が古くても無条件でキャッシュを再利用する
- 修正後: キャッシュされたfactの`metadata.prompt_version`が現行`SEARCH_PROMPT_VERSION`と異なる場合は再取得（web検索を実行し`match_sourced_facts`を更新）する。一致する場合は従来通りキャッシュを使う

処理すべきエッジケース:
- `metadata.prompt_version`がNULL（古い形式、DB実測でrecap用に3件存在）の場合は「バージョン不一致」として再取得対象にする（spec「未解決の質問」参照。`lib/llm/sourced-facts/types.ts`の`SourcedFact`/`StoredSourcedFact`型でNULL安全に扱うこと）
- `contentType: "preview"`の既存の時間ベースキャッシュ失効ロジック（`PREVIEW_REFRESH_WINDOW_HOURS`・`PREVIEW_FRESHNESS_HOURS`）には変更を加えないこと。バージョン不一致チェックは`recap`・`preview`どちらにも一貫して効かせてよいが、preview側の既存の時間判定を壊さないこと
- `cachedFacts`が複数件ある場合、どのレコードの`prompt_version`を代表値として比較するか（例: 最新の`fetched_at`を持つ1件、`loadSourcedFactsForMatch`が`order("fetched_at", { ascending: false })`で既にソート済みなので先頭要素を使うのが自然）

完了の定義:
- specの受け入れ条件1〜3をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（`isSourcedFactsEnabledForMatch()`の対象拡大、previewの時間ベースキャッシュロジック変更、既存17試合の一括再取得スクリプト）は実装しない
- テストは `tests/llm/sourced-facts.test.ts` の `describe("fetchSourcedFactsForMatch", ...)` ブロック（既存テスト「uses cached facts without calling web search inside the freshness window」の近く）に追加する
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
