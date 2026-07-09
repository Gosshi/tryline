`/specs/feat-top14-regular-season-backfill.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の類似バックフィルスクリプトのパターンは `scripts/import-top-14-results.ts`（プレーオフ専用、`upsertCompetition`/`getTeamLookup`/`upsertMatches`の構造）と `scripts/backfill-standings.ts`（`--dry-run`・Owner承認ゲートのパターン）を参照
- `top14.lnr.fr/calendrier-et-resultats/{season}/{roundSlug}` のURL構造・robots.txt許可範囲は `specs/feat-top14-team-stats.md` の「事前調査」セクションで既に検証済み（2026-07-06時点でCodexが実際にfetchWithPolicy経由でアクセスし200を確認、`/calendrier-et-resultats`と`/feuille-de-match`はrobots.txtでDisallowされていない）。この検証結果をそのまま信頼してよいが、実装時に念のため再確認すること
- Wikipedia経由（`lib/scrapers/wikipedia-top-14-results.ts`）では正規シーズンの日付・会場情報が取得できないことを確認済み（対戦マトリックス形式のみで個別試合の日程情報がない）。今回は完全に新しいデータソース（LNR公式サイト）を使う
- チームslug対応表は既存の `TEAM_SLUG_BY_WIKIPEDIA_NAME`（`lib/scrapers/wikipedia-top-14-results.ts`）のチーム名リストを参考にできるが、LNR公式サイト側のチーム表記は異なる可能性があるため実装時に確認すること

入出力の例:
- `node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-top14-regular-season.ts --season=2025-26 --dry-run` を実行すると、j1〜j26の26ラウンド分、182試合前後の取り込み対象が一覧表示される
- 実行後（Owner承認・`--confirm-owner-approved`付き）、`matches`テーブルにTop14 2025-26シーズンの試合が対戦カード・日付・会場・スコア付きで追加される

処理すべきエッジケース:
- 既存のプレーオフ試合（5件/2025-26、6件/2024-25）と重複登録しないよう、upsert条件（`competition_id, home_team_id, away_team_id, kickoff_at`等）を既存の`import-top-14-results.ts`と同様に設定する
- LNR公式サイトのチーム名表記がTryline内部のteam slugと一致しない場合、不明なチームはエラーで停止し一覧を出力する（既存`import-top-14-results.ts`の`getTeamLookup`と同じ挙動）
- 未開催・中止試合等、スコアが確定していない試合の扱い（`status`を適切に設定する）

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番書き込みはOwnerが別途行うため、実装・テスト・`--dry-run`確認までで完了とする）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 新規スクレイパー・バックフィルスクリプトのユニットテストを追加する（固定HTMLフィクスチャを使う既存パターンに倣う）

要件:
- スコープ対象外（チームスタッツ取得、match_events取得、過去シーズンへの遡及、recap/preview生成）は実装しない
- 未解決の質問（チームslug名寄せ、feuille-de-matchページとの将来的な連携）について、迷う場合は完了報告で質問として提示する。推測しない
- 本番DBへの実書き込みは行わない

完了時:
- 実装内容、変更・新規ファイルを要約する
- `--dry-run`実行結果（対象件数）を完了報告に含める
- 仕様書からの逸脱があれば理由を明示する
