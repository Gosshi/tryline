`/specs/fix-featured-competition-switch-to-nc.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `lib/featured-competition.ts`の現在の内容（`family: "pnc"`）を`family: "nations-championship"`・`season: "2026"`に変更する、シンプルな定数変更です
- `components/featured-competition-card.tsx`・`app/page.tsx`での呼び出し箇所を確認し、画像アセット解決ロジック（大会ごとの画像が無い場合のフォールバック）がどう動くか確認すること

入出力の例:
- ホームの「注目大会」セクションが「ネーションズチャンピオンシップ 2026 を追う」の見出しで、実際のNC 2026データ（次戦・レビュー本数・今週の試合数）を表示する

処理すべきエッジケース:
- Nations Championship専用の画像アセットが無い場合、既存の他大会と同様のフォールバック画像で表示が破綻しないことを確認する

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6のスクリーンショット確認は自分で実施し、本番デプロイのみOwnerが別途行う）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- Playwright等で実際の表示を確認したスクリーンショットを完了報告に含める

要件:
- スコープ対象外（自動切替の仕組み、専用画像アセットの新規作成）は実装しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
