# Codex プロンプト: fix-weekly-news-deprecation

2部構成。**A(tryline/web) → B(tryline-mobile) の順序を厳守**。Bのapi-types同期はAの完了(マイグレーション追加+`pnpm supabase:types`実行後の型)に依存するため、Aが完了するまでBに着手しないこと。

---

## プロンプトA（trylineリポジトリで貼る）

`specs/fix-weekly-news-deprecation.md` の「対象（tryline / web）」セクションを実装してください。

コンテキスト:
- `AGENTS.md` を読む
- この機能(`weekly_news_items`)は稼働開始以来一度も公開実績がなく、捏造記事の混入インシデントを理由にOwner判断で廃止する。安全に削除できる状態
- 削除対象ファイルの一覧はspecに明記済み。まずそれぞれの参照元(import元)を`grep`で洗い出してから削除すること。特に`lib/api/v1/types.ts`の型は他機能から参照されていないか必ず確認する
- `app/api/og/route.tsx`の`type === "weekly-news"`分岐は、その分岐だけを削除し、他のtype分岐(story, match等)には触れない
- 新規マイグレーションは`drop table if exists weekly_news_items;`のみのシンプルな内容。既存の2本のマイグレーションファイル(`20260726010000_create_weekly_news_items.sql`, `20260726020000_enable_weekly_news_items_rls.sql`)は編集・削除しない(履歴として残す)
- マイグレーション追加後、`pnpm supabase:types`を実行して`lib/db/types.ts`を再生成する(ローカルSupabaseに対して実行。本番へは適用しない)

エッジケース:
- `app/sitemap.ts`から`/news`エントリを削除する際、他のエントリのカンマ・配列構造を壊さないこと
- テストファイルは丸ごと削除する(該当テストケースだけを間引く必要はない、web側は全てweekly-news専用ファイルのため)

やらないこと:
- Match Stories内news item(`match_sourced_facts`起点、`buildNewsItems`)には一切手を加えない
- 新規マイグレーションの本番適用(`supabase db push`等)。ファイル作成のみ

完了の定義:
- specの受け入れ条件1〜4, 6, 7, 8(web分), 9を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更・削除したファイル一覧を報告する

完了時:
- 実装内容を要約する
- 「マイグレーションファイルを作成した。本番適用はOwnerに依頼してください」と明記する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

---

## プロンプトB（tryline-mobileリポジトリで貼る、プロンプトA完了後に着手）

`specs/fix-weekly-news-deprecation.md`(tryline側specのミラーは`docs/specs/`に配置予定、無ければtryline側の同名ファイルを参照)の「対象（tryline-mobile）」セクションを実装してください。**プロンプトAがtryline側でマージ済みであることを前提とする**。

コンテキスト:
- `AGENTS.md` を読む
- `app/(tabs)/index.tsx`から`WeeklyNewsSection`を削除すると、レイアウトは`Rwc2027Banner`→`MatchStoriesSection`→(既存の他セクション)という並びに戻る
- `reference/api-types.ts`の同期漏れが過去に発生した実績がある([[feedback_api_types_sync]])。weekly-news関連の型を削除する際、tryline側の最新`reference/api-types.ts`(プロンプトA完了後のもの)と突き合わせて漏れなく削除する

エッジケース:
- `__tests__/api-client.test.ts`と`__tests__/pull-refresh-live-autorefresh.test.tsx`は、weekly-news関連のテストケースのみを削除し、他のテストケース(favorite-team-next-match等、無関係な機能のテスト)は残す。ファイルごと削除しない

やらないこと:
- `MatchStoriesSection`や他のホーム画面セクションの変更

完了の定義:
- specの受け入れ条件5, 8(mobile分)を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更・削除したファイル一覧を報告する

完了時:
- 実装内容を要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
