`/specs/fix-competition-guide-factual-errors-and-broadcast-verification.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `competition_guides` テーブル（`family`, `guide_ja`, `updated_at`）の現在のスキーマ・既存クエリは `lib/db/queries/` 配下で `getCompetitionGuide` 等を検索して確認すること
- RWCガイドの表示コンポーネントは `components/competition-viewing-guide.tsx` 周辺と思われるが、実際の呼び出し経路は `app/c/[competition]/[season]/page.tsx` から辿って確認すること

入出力の例:
- マイグレーション適用後、`competition_guides` テーブルに `family='rwc'` の行が `verified_at`・`source_url` を持つ
- RWCガイドページ (`/c/rwc`) の表示から「20カ国」の記述が消え、「24チーム・52試合」に置き換わっている

処理すべきエッジケース:
- 他10大会のガイドは `verified_at` が null のまま残る想定。null の場合の表示・断定表現の扱いは spec の「UI サーフェス」節を参照し、具体的な実装方法に迷ったら完了報告で質問として提示する
- 既存の11件の `guide_ja` 全文を書き換える必要はない。RWCの参加チーム数・試合数の記述のみ修正する

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番マイグレーション適用はOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- マイグレーションファイルを追加し、ローカルで適用確認する

要件:
- スコープ対象外（他10大会の放送情報の実際の再検証、ガイド更新の自動化）は実装しない
- 未検証情報の扱いに迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- RWC参加チーム数修正時に確認した公式ソースURLを完了報告に明記する
- 仕様書からの逸脱があれば理由を明示する
