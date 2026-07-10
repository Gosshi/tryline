`/specs/feat-sample-matches-auto-rotation.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `lib/sample-matches.ts` の現在の実装（`SAMPLE_MATCH_IDS`・`isSampleMatch`）を読み、既存の呼び出し元（`app/page.tsx` の無料サンプルレビューセクション、`app/pricing/page.tsx` 等）を `grep -rn "isSampleMatch\|SAMPLE_MATCH_IDS" app/ components/` で確認すること
- 既存のcronパターンは `app/api/cron/` 配下の他のルート（例: `app/api/cron/audit-data-integrity/route.ts`）を参考にする
- 「終了試合」「recap公開済み」の判定は `lib/db/queries/matches.ts`・`lib/db/queries/match-content.ts` の既存クエリを再利用すること

入出力の例:
- 直近30〜60日以内に終了し、recapが公開されている試合から、複数大会にまたがる8件を選ぶ
- 選定結果を `sample_matches` テーブル（新設する場合）または既存の設定保持の仕組みに保存し、`isSampleMatch`/`SAMPLE_MATCH_IDS` 相当の関数がそこから読む

処理すべきエッジケース:
- 直近30〜60日以内にrecap公開済みの試合が8件に満たない場合、期間を延長するか、既存の固定リストにフォールバックするかはCodexの判断に委ねる
- 大会の偏り防止ロジック（1大会最大何件まで等）の具体的な閾値はCodexが決めてよい

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイ・cron設定はOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 新規テーブルを追加する場合はマイグレーションファイルを追加する

要件:
- スコープ対象外（LLMによる好試合判定、表示UI自体の変更）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- 選定ロジックの再計算タイミング（cron or 動的クエリ）を説明する
- 仕様書からの逸脱があれば理由を明示する
