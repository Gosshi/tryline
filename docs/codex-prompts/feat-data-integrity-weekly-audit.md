`/specs/feat-data-integrity-weekly-audit.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- cron ルートの構成パターンは `app/api/cron/fill-event-gaps/route.ts`（`assertCronAuthorized` → 処理 → `NextResponse.json`）を参照
- Slack通知は `lib/llm/notify.ts` の `postToSlack`（内部関数）パターンを再利用する。新しいエクスポート関数 `notifyDataIntegrityReport` を同ファイルに追加する
- GitHub Actions ワークフローは `.github/workflows/cron-ingest-standings.yml` の構成（`schedule` + `workflow_dispatch`、`curl -X POST` で cron エンドポイントを叩く）をそのまま踏襲する
- 重複イベント検知のロジックは `scripts/cleanup-contaminated-events.ts`（署名ベースの検出、`type|minute|player_id` をソート連結してハッシュ化）を参照し、可能なら関数として切り出して cron からも呼べるようにする（重複実装を避ける）
- スコア不一致検知は `lib/llm/stages/assemble.ts` の `eventTotalsMatchFinalScore`（既にエクスポート済み）を再利用する

入出力の例:
- `workflow_dispatch` で手動実行すると、以下5項目の集計結果を含むレスポンスが返る: (1) 重複イベントを共有する試合グループ数 (2) スコア不一致の試合数 (3) finished かつイベント0件の試合数 (4) draft滞留数・直近7日以内のdraft数 (5) 進行中大会で順位表が7日以上更新されていない大会一覧
- Slack webhook 未設定時は `console.warn` のみを出し、cronは正常終了する（既存の `postToSlack` と同じフェイルセーフ）

処理すべきエッジケース:
- 順位表鮮度チェックは、終了済み大会（`competitions.end_date` が過去）を誤検知しないよう、進行中シーズンのみに絞る
- 重複イベント検知は、イベント数が極端に少ない試合（4件未満等）を誤検知しないよう、既存の `cleanup-contaminated-events.ts` の閾値をそのまま使う

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 5項目それぞれに対応する独立したユニットテストを追加する
- `.github/workflows/cron-audit-data-integrity.yml` を新設する

要件:
- スコープ対象外（検知した問題の自動修正、LLMを使った本文監査、Slack以外の通知）は実装しない
- 未解決の質問（進行中シーズンの判定方法、通知閾値）について、迷う場合は完了報告で質問として提示する。推測しない
- LLM呼び出しは一切含めない（決定的チェックのみ）

完了時:
- 実装内容、変更・新規ファイルを要約する
- 選んだcronスケジュール（曜日・時刻）とその理由を明記する
- 仕様書からの逸脱があれば理由を明示する
