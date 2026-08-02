# 「今週のニュース」(weekly_news_items)機能の廃止・試合紐付けニュースへの一本化

## 背景

2026-07-26〜27に実装・デプロイした「今週のニュース」機能（`weekly_news_items`テーブル、週次Web検索→LLMが直接`title_ja`/`summary_ja`を生成する1段階パイプライン）で、公開前のdraft 2件がいずれも実在しない記事（URL 404、および記事本文のないナビゲーション構造のみのページ）だったことが判明した（2026-07-27、Owner確認）。原因は、既存の試合コンテンツパイプライン（収集→事実抽出→ナラティブ生成→品質チェックの4段階）と異なり、`weekly_news_items`は検索結果からLLMが直接要約を生成するのみで、実際にfetchした記事本文からの事実抽出・実在確認ステップを経ていないこと。これにより、試合コンテンツ向けに稼働している捏造ゲート（#467/#551）の対象外になっていた。

Owner判断（2026-07-27）で新規収集を停止済み。稼働開始以来、`weekly_news_items`で`status='published'`の行は**一度も存在しない**（draft 2件のみで、両方とも捏造と判明しdelete済み）。

一方、Match Stories機能内の「news item」（`match_sourced_facts`起点、`app/api/v1/stories/route.ts`の`buildNewsItems`）は、既存のプレビュー/レビュー生成と同じsourced-facts検索基盤を流用しており、2026-07-18の本番稼働以来、日本語×high確度×キックオフ前のfactを実際に配信できている実績がある（同日時点で11件配信、以降も継続稼働）。

2026-08-02、Ownerと協議の上、**`weekly_news_items`機能を廃止し、「ニュース」はMatch Stories内news item(試合紐付け)に一本化する**方針を決定。実績ゼロの機能を、実績のある既存機能に統合することで、コード・データモデル・UIの分散を解消する。

## スコープ

対象（tryline / web）:
- `app/news/page.tsx` を削除
- `app/api/v1/stories/weekly-news/route.ts` を削除
- `app/api/og/route.tsx` の `type === "weekly-news"` 分岐（910行目付近）を削除
- `app/sitemap.ts` の `/news` エントリ（98行目付近）を削除
- `lib/llm/weekly-news/fetch.ts` を削除
- `lib/db/queries/weekly-news.ts` を削除
- `scripts/fetch-weekly-news.ts`（手動試し焼き用スクリプト）を削除
- `lib/api/v1/types.ts` から `V1WeeklyNewsItem` 等、weekly-news専用の型を削除（他機能で使われていないことを確認してから削除する）
- 新規マイグレーションを追加し `weekly_news_items` テーブルを `drop table` する（既存マイグレーションファイルは編集しない、新規ファイルを追加する）
- マイグレーション追加後 `pnpm supabase:types` を実行し `lib/db/types.ts` を再生成する
- 関連テストを削除: `tests/api/mobile-api-v1-weekly-news.test.ts`, `tests/api/og-weekly-news.test.tsx`, `tests/app/news-page.test.tsx`, `tests/db-migrations-weekly-news-items.test.ts`, `tests/db-migrations-weekly-news-items-rls.test.ts`, `tests/db-queries-weekly-news.test.ts`, `tests/llm/weekly-news.test.ts`, `tests/scripts/fetch-weekly-news.test.ts`

対象（tryline-mobile）:
- `src/stories/WeeklyNewsSection.tsx` を削除
- `app/(tabs)/index.tsx` から `WeeklyNewsSection` の呼び出し・import を削除
- `src/api/client.ts` / `src/api/types.ts` / `reference/api-types.ts` から weekly-news関連のAPI呼び出し・型を削除
- `__tests__/weekly-news-stories.test.tsx` を削除、`__tests__/api-client.test.ts` と `__tests__/pull-refresh-live-autorefresh.test.tsx` 内のweekly-news関連テストケースのみを削除（他のテストケースは残す）

対象外:
- Match Stories内news item（`match_sourced_facts`起点）の実装変更。現状のまま維持する
- 「一般ニュース（試合非依存）」機能の再設計・再実装。将来的に必要になった場合は、match_sourced_facts側の検証基盤を再利用する形で別途spec化する（今回はスコープ外）

## データモデル変更

新規マイグレーション（ファイル名は実装日で採番、例 `supabase/migrations/<実装日>_drop_weekly_news_items.sql`）:

```sql
drop table if exists weekly_news_items;
```

**重要**: このマイグレーションファイルの作成はCodexのスコープ内だが、本番Supabaseへの適用（`supabase db push`等）はOwner自身が実行する（CLAUDE.mdの方針により、DROP TABLEを含むDDLはClaude CodeもCodexも本番へ直接実行しない）。Codexは「マイグレーションファイルを作成した。本番適用はOwnerに依頼してください」と完了報告に明記すること。

## API サーフェス

削除: `GET /api/v1/stories/weekly-news`

## UI サーフェス

削除: web `/news` ページ、mobile ホーム画面の `WeeklyNewsSection`。削除後、mobileホーム画面のレイアウトは `WeeklyNewsSection` が無かった状態（`fix-mobile-pull-refresh-live-autorefresh`実装前後のレイアウト）に戻ることを確認する。

## 受け入れ条件

1. web: `/news` にアクセスすると404になる
2. web: `GET /api/v1/stories/weekly-news` が404になる
3. web: `/api/og?type=weekly-news&...` が404または適切なエラーになる（既存の未知typeの扱いに準じる）
4. web: `app/sitemap.ts` の出力に `/news` が含まれない
5. mobile: ホーム画面に `WeeklyNewsSection` が表示されない、関連コードがビルドに含まれない
6. 新規マイグレーションファイルが追加されており、ローカルSupabaseで適用すると `weekly_news_items` テーブルが削除されることを確認する（ローカル検証のみ、本番適用はしない）
7. `pnpm supabase:types` 実行後の `lib/db/types.ts` に `weekly_news_items` の型定義が残っていない
8. web/mobile とも `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が通る（削除対象のテストはテストファイルごと削除するため、残存テストのみで green になること）
9. Match Stories内news item（試合紐付け）の既存動作に影響がないこと（既存テストの回帰なし）

## 未解決の質問

なし。方針はOwner確定済み（2026-08-02）。
