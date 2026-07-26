# Codex プロンプト: fix-weekly-news-items-rls

**tryline リポジトリ**で貼る(仕様書: `specs/fix-weekly-news-items-rls.md`)。`feat-weekly-news-stories-api.md`(PR #645、マージ・デプロイ済み)の直後のセキュリティフォローアップ。

---

`specs/fix-weekly-news-items-rls.md` の仕様を実装してください。本番監査で`public.weekly_news_items`だけRLS(Row Level Security)が無効になっていることが判明しました。新規マイグレーションでRLSを有効化し、`status = 'published'`の行のみを公開する読み取りポリシーを追加してください。

コンテキスト:
- 参考実装: `supabase/migrations/20260606010000_create_match_sourced_facts.sql`(RLS有効化+公開readableポリシーの既存パターン)
- 対象テーブルのマイグレーション: `supabase/migrations/20260726010000_create_weekly_news_items.sql`(既存、変更しない。新規マイグレーションを追加する)
- 参考テスト: `tests/db-migrations-weekly-news-items.test.ts`
- `AGENTS.md`を読む

やること:
1. 新規マイグレーションファイルを`supabase/migrations/`に追加し、以下を含める:
   ```sql
   alter table public.weekly_news_items enable row level security;

   create policy "published weekly news items are publicly readable"
     on public.weekly_news_items
     for select
     to anon, authenticated
     using (status = 'published');
   ```
2. マイグレーション内容を検証するテストを追加(`tests/db-migrations-weekly-news-items.test.ts`と同様のファイル読み込み+正規表現マッチのパターン)

エッジケース:
- `match_sourced_facts`の`using (true)`パターンをそのままコピーしないこと。`weekly_news_items`は`status`列によるOwnerレビューゲートがあるため、ポリシーは`status = 'published'`に限定する

やらないこと:
- `app/api/v1/stories/weekly-news/route.ts`の変更(service roleクライアントのためRLSの影響を受けない)
- 既存の`weekly_news_items`テーブル定義の変更
- 本番DBへのマイグレーション適用(Owner実施)

完了の定義:
- specs の受け入れ条件 1〜4 を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
