`/specs/feat-nations-championship-2026-standings.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `scripts/backfill-standings.ts`（`SUPPORTED_FAMILIES`・`resolveWikipediaStandingsUrl`）と `lib/ingestion/weekly-standings.ts`（週次自動更新、`WEEKLY_STANDINGS_FAMILIES` は `SUPPORTED_FAMILIES` から派生するため自動反映される見込み）
- Nations Championship 2026 は Northern Hemisphere・Southern Hemisphere の2グループ制。この「1大会内で複数グループの順位表を持つ」構造は RWC のプールステージで既に実装済み（`competition_pools` テーブルの `pool_name` + `competition_standings` の各グループ内相対 `position` のペア）。同じパターンを再利用すること
- RWCプール取り込みの既存実装箇所（`scripts/backfill-standings.ts` や関連ファイル）を先に読み、同じ関数・ロジックを使い回せないか確認してから実装する
- ボーナスポイント方式（勝利4点・引分2点・敗北0点、4トライ以上+1、8点差以内敗戦+1）は Wikipedia の `2026_Nations_Championship` ページに明記されている

入出力の例:
- `node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-standings.ts --family=nations-championship --season=2026 --dry-run` を実行すると、Northern 6チーム・Southern 6チームの取り込み対象が表示される
- 実行後、`competition_standings` の該当行の `position` が、南北それぞれのグループ内で1〜6になっている（1〜12の通し番号ではない）

処理すべきエッジケース:
- `scrapeCompetitionStandings`（`lib/scrapers/wikipedia-standings.ts`）が単一テーブル前提の実装だった場合、複数テーブルページに対応させる必要がある。既存のRWCプール実装がこの関数を使っているか、別の専用ロジックかを確認してから対応する
- 7月4日時点で南北とも1試合のみ終了、という部分的なシーズン状態でも正しく取り込めること

完了の定義:
- specs の受け入れ条件 1〜7 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- ボーナスポイント計算・グループ別position割り当てのユニットテストを追加する

要件:
- スコープ対象外（シーズンページの表示変更が不要な場合はそこに手を入れない、11月のファイナルズウィークエンドの特別ロジック）は実装しない
- 未解決の質問（複数テーブル対応の共通化方針）は、迷う場合は完了報告で質問として提示する。推測しない
- 本番DBへの実書き込みは行わず、実装・テストまでで完了とする（実際の `--confirm-owner-approved` 実行はOwnerが別途行う）

完了時:
- 実装内容、変更ファイルを要約する
- RWCプール実装との共通化をどう扱ったか（関数共有 or 個別実装、理由とともに）明記する
- 仕様書からの逸脱があれば理由を明示する
