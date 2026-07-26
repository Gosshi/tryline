# fix-weekly-news-items-rls: weekly_news_itemsのRLS有効化

対象リポジトリ: **tryline**のみ。`feat-weekly-news-stories-api.md`(PR #645、マージ・デプロイ済み)の直後のフォローアップ。

## 背景

PR #645のマージ後、本番Supabaseを監査したところ、新規テーブル`public.weekly_news_items`だけ**RLS(Row Level Security)が無効**であることが判明した(`public.match_sourced_facts`・`public.match_broadcasts`等、他の全公開系テーブルはRLS有効)。マイグレーション`supabase/migrations/20260726010000_create_weekly_news_items.sql`に`alter table ... enable row level security`とポリシー定義が抜けていた。

`app/api/v1/stories/weekly-news/route.ts`は`getSupabaseServerClient()`(service roleキー)を使っているため、RLSを有効にしてもアプリ自身の読み取りには影響しない。RLSが無効な現状では、`anon`ロール(クライアントに埋め込まれる公開鍵)で誰でもテーブルへ直接アクセスできる状態になっている。

**通常のポリシーをそのまま踏襲しない理由**: `match_sourced_facts`の既存ポリシーは`using (true)`(無条件で公開readable)だが、`weekly_news_items`には`status`列(`draft`/`published`)によるOwnerレビューゲートがある。`using (true)`をそのまま適用すると、`anon`ロールが直接Supabase REST APIを叩けば`draft`行(未レビューのAI生成コンテンツ)まで読めてしまい、レビューゲートの意味がなくなる。ポリシーは`status = 'published'`に絞る。

## スコープ

対象:
1. 新規マイグレーション: `weekly_news_items`にRLSを有効化し、`status = 'published'`の行のみ`anon`・`authenticated`ロールに公開する読み取りポリシーを追加する

対象外:
- 既存の`weekly_news_items`テーブル定義・列の変更
- 他テーブルのRLS監査(今回はこのテーブルのみ)
- 本番マイグレーションの適用(Owner実施)

## データモデル変更

新規マイグレーション(ファイル名は現在日時に合わせてCodexが採番):

```sql
alter table public.weekly_news_items enable row level security;

create policy "published weekly news items are publicly readable"
  on public.weekly_news_items
  for select
  to anon, authenticated
  using (status = 'published');
```

## API サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. 新規マイグレーションファイルが`supabase/migrations/`に追加され、上記2文を含む
2. マイグレーションの内容を検証するテスト(既存の`tests/db-migrations-weekly-news-items.test.ts`と同様のパターンで、`enable row level security`と`using (status = 'published')`を含むことを確認)
3. `app/api/v1/stories/weekly-news/route.ts`・既存テストへの変更は不要(service roleクライアントのためRLSの影響を受けない。無変更で全テスト通過を確認する)
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

なし。
