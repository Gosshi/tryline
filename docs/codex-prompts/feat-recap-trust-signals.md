`/specs/feat-recap-trust-signals.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `components/match-content-section.tsx`（`afterBody` スロットあり）、`components/match-lineups-section.tsx`、`lib/db/queries/match-content.ts` の `PublishedMatchContent`（`generatedAt` を持つ）を読んで現状の実装を理解すること
- `match_sourced_facts` テーブルへのクエリ関数は `lib/llm/sourced-facts/fetch.ts` 周辺、または `lib/db/queries/` 配下に既存のものがあるか確認すること。無ければ件数取得用の軽量クエリを新規に追加してよい
- `app/matches/[id]/page.tsx` で既に `getMatchLineupsForMatch` を呼び出している箇所を参考に、同ページで `match_sourced_facts` の件数も取得する

入出力の例:
- ラインアップあり・sourced_facts 2件・生成日時2026-07-10の記事 → 「ラインアップ確認済み・参照元2件・更新: 2026-07-10」等の表示
- ラインアップなし・sourced_facts 0件の記事 → 生成日時のみ、または該当箇所を表示しない

処理すべきエッジケース:
- ラインアップ・sourced_facts が0件の場合、ネガティブな「未確認」表示にはしない（単に非表示にする）
- recap（レビュー）とpreview（プレビュー）の両方でこの表示を出す

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（出典URLの一般公開、大会ガイドページへの追加）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
