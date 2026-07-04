`/specs/fix-backfill-wikipedia-round-number-type.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `scripts/backfill-nations-championship-wikipedia-urls.ts` の `getWikipediaRound()`（`getStringValue()` を使っている箇所）
- 本番実行（dry-run）で実際に発生した不具合の修正。`external_ids.wikipedia_round` はJSON数値型で保存されている（本番SQLで`jsonb_typeof`確認済み）

入出力の例:
- 変更前: `getWikipediaRound({ wikipedia_round: 1 })` → `null`（バグ）
- 変更後: `getWikipediaRound({ wikipedia_round: 1 })` → `"1"`
- 後方互換: `getWikipediaRound({ wikipedia_round: "1" })` → `"1"`（文字列でも引き続き動作）

処理すべきエッジケース:
- `wikipedia_round` が存在しない、または不正な型（null、オブジェクト等）の場合は `null` を返す（既存の安全側動作を維持）
- 数値の場合、`Number.isFinite`で有限数値のみ受け付ける

完了の定義:
- specの受け入れ条件1-3、5を満たす（受け入れ条件4は本番dry-run確認でOwnerが実施）
- `pnpm test`・`pnpm tsc --noEmit` 通過

要件:
- 受け入れ条件セクションのすべてを実装する
- 他のロジック（URL選定・イミュータブルマージ等）は変更しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
