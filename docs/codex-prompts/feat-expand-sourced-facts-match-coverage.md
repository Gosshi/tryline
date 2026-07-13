`/specs/feat-expand-sourced-facts-match-coverage.md` の仕様を実装してください。

**前提**: `specs/fix-sourced-facts-stale-prompt-version-cache.md`（PR先行）が既にマージ済みであることを確認してから着手してください。未マージの場合は先にそちらを実装・マージしてもらうようOwnerに確認を求めてください（対象拡大直後から最新プロンプトのfactを取得できるようにするため）。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/llm/sourced-facts/fetch.ts` の `isSourcedFactsEnabledForMatch()`（L74-94）
- 現状 League One・ネーションズチャンピオンシップ・各大会の決勝/準決勝/準々決勝のみが対象で、Premiership/URC/Top 14/Super Rugby Pacific/Six Nations/Rugby Championship/PNC等の通常シーズン戦は対象外。これを全試合へ拡大する
- コスト見積もり（spec記載）: 月$4〜12程度の恒常コスト増（web_search_preview呼び出し$25/1,000回＋トークン課金）。Owner承認済み

入出力の例:
- 修正前: `isSourcedFactsEnabledForMatch({competition: {family: "premiership"}, external_ids: {round_name: "Round 12"}})` は `false`
- 修正後: 同じ入力が `true` を返す（全大会・全ラウンドで有効化）

処理すべきエッジケース:
- 既存の`league-one`・`nations-championship`・決勝/準決勝/準々決勝ラウンドの有効化ロジックにリグレッションがないこと（そもそも全部`true`になるので自明だが、テストは維持する）
- `shouldUseCachedFacts()`・`MAX_STORED_FACTS`・previewの時間ベースキャッシュ間隔には一切手を加えないこと（スコープ外）

完了の定義:
- specの受け入れ条件1〜3をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- テストは `tests/llm/sourced-facts.test.ts` の `describe("isSourcedFactsEnabledForMatch", ...)` ブロックを更新する。既存の3テスト（「enables Nations Championship regular-round matches」「keeps League One and knockout-round behavior enabled」「keeps non-target regular-round matches disabled」）のうち、**3つ目「keeps non-target regular-round matches disabled」は意図的な仕様変更のため、`toBe(true)`を返すよう反転させる**（テスト名も実態に合わせて変更してよい）。加えてspec受け入れ条件1にある大会ファミリー（premiership/urc/top-14/super-rugby-pacific/six-nations/rugby-championship/pnc/autumn-nations/rwc）で`true`になることを確認するテストケースを追加する
- 「スコープ対象外」（allowlist.tsのドメイン変更、MAX_STORED_FACTS変更、previewキャッシュ間隔調整、段階展開用のフラグ実装）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
