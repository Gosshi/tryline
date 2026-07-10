`/specs/fix-home-page-cta-flow.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `app/page.tsx` 全体を読み、ヒーローセクションのCTA配置（`TrackedLink` の `home_hero_pricing` 等）、`HomeMatchdayBoard`、無料サンプルレビューセクション、その後続のセクション構成を把握すること
- CTAクリックの計測（`TrackedLink` の `analytics` prop）は既存の `cta_id`/`cta_location` の命名規則に合わせて更新すること（CTA順序を変えても計測自体は維持する）

入出力の例:
- ヒーロー内のCTAボタンの表示順序が「今週の試合を見る」→「Premium無料体験」になる
- モバイル幅で表示した際、試合情報の重複表示が解消されている

処理すべきエッジケース:
- Premium会員（`profile?.subscription_status === "premium"`）にはPremium CTA自体を表示しない、という既存の分岐は維持する
- 試合が無い週（`homepageWeekMatches.length === 0`）の場合の既存レイアウト分岐（`max-w-3xl` になる箇所）を壊さない

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6のスクリーンショット確認は自分で実施し、本番デプロイのみOwnerが別途行う）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- Playwright等で実際にモバイル・デスクトップ表示を確認したスクリーンショットを完了報告に含める（または確認手順を明記する）

要件:
- スコープ対象外（ヒーローのビジュアルデザイン変更、HomeMatchdayBoardのロジック変更）は実装しない
- 統合方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更ファイルを要約する
- HomeMatchdayBoardと後続セクションをどう整理したか説明する
- 仕様書からの逸脱があれば理由を明示する
