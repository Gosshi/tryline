`/specs/backfill-nations-championship-wikipedia-urls.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 参考実装: `scripts/backfill-nations-championship-kickoff-times.ts`（本日マージ済み、同じdry-run/--confirm-owner-approved規約・チーム名ペアでのマッチング方式）
- `app/api/cron/ingest-lineups/route.ts` が `matches.external_ids.wikipedia_url` を読んで確定ラインアップ取り込みを行う。未設定だと400エラーで `no_url` としてスキップされる（`lib/cron/orchestrate.ts`）
- 対象URL（Web調査で確認済み）: NC 2026 Round1-3→`https://en.wikipedia.org/wiki/2026_Nations_Championship_Southern_Hemisphere_Series`、Round4-6→`https://en.wikipedia.org/wiki/2026_Nations_Championship_Northern_Hemisphere_Series`

入出力の例:
- dry-run: `node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-wikipedia-urls.ts` → NC 2026の36試合(18+18)・Six Nations 2027の15試合、計51件が対象表示される
- 本実行: `--confirm-owner-approved` で実際に `external_ids.wikipedia_url` を更新

処理すべきエッジケース:
- Finals Weekend（対象記事`2026_Nations_Championship_Finals`が未作成）は対象外。該当試合行自体が現状DBに存在しない想定だが、念のため存在確認すること
- 既存の `external_ids` には `source`・`wikipedia_event_id`・`wikipedia_round` が設定済み（本番検証済み・2026-07-04）。これらを温存し、`wikipedia_url`だけをイミュータブルに追加・更新すること
- ラウンド判定は `external_ids.wikipedia_round`（文字列 `"1"`〜`"6"`、全36試合に設定済み・本番検証済み）を使うこと
- Six Nations 2027 の URL は既存定数 `WIKIPEDIA_SIX_NATIONS_2027_URL`（`lib/ingestion/sources/wikipedia-six-nations-2027.ts:3`、値は `https://en.wikipedia.org/wiki/2027_Six_Nations_Championship`）を import して再利用すること

完了の定義:
- specの受け入れ条件5項目すべてを満たす
- `pnpm test`・`pnpm tsc --noEmit` 通過
- 実際の本番実行はしない（Owner承認後に別途実行する）

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目（Finals Weekend、seed-wikipedia-external-ids.tsの汎用化、ラインアップ取り込み自体の実行）は実装しない
- 曖昧な箇所（specの「未解決の質問」）は実装時に調査し、結果を報告すること。推測で進めない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
