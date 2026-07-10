`/specs/fix-preview-generation-window-timing.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `lib/cron/orchestrate.ts` の `PREVIEW_WINDOW_START_HOURS`/`PREVIEW_WINDOW_END_HOURS` 定数と、それを使う `toIsoDate(now, PREVIEW_WINDOW_END_HOURS)` の呼び出し箇所（220行目付近）を確認すること
- `orchestrate` のテストファイル（`tests/cron/orchestrate.test.ts` 等、実際のファイル名は `grep -rln "PREVIEW_WINDOW" tests/` で確認）が窓の値に依存している場合、その期待値も更新すること

入出力の例:
- `PREVIEW_WINDOW_END_HOURS` が `72` から `48` に変更される
- キックオフ48〜12時間前の試合のみがプレビュー生成対象になる（従来は72〜12時間前）

処理すべきエッジケース:
- recap側のウィンドウ設定（もしあれば）には触れない
- `PREVIEW_WINDOW_START_HOURS`（12時間前の下限）は変更しない

完了の定義:
- specs の受け入れ条件 1〜4 をすべて満たす（受け入れ条件5の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（大会ごとの窓設定、ダイジェストルーティンの変更、recapウィンドウの変更）は実装しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
