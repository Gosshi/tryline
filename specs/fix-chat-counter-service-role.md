# fix-chat-counter-service-role: チャット無料枠カウンタの自己リセット穴を塞ぐ

## 背景

`feat-premium-entitlement-refactor`（2026-07-14）のカラムレベル grant 変更で、`user_profiles` の `chat_daily_count` / `chat_daily_reset_date` は `authenticated` ロールの UPDATE 対象として残した。これは `app/api/chat/[matchId]/route.ts` が cookie 認証クライアント（`getSupabaseServerClientWithAuth`）でカウンタを更新しているためだが、裏を返すと**ログインユーザーが supabase-js から自分のカウンタを 0 に戻し、無料チャット枠を無限に使える**（LLM 従量コストに直結）。

カウンタ書き込みをサーバー専用（service role）に移し、クライアントロールの UPDATE grant から外す。

## スコープ

対象:
- `app/api/chat/[matchId]/route.ts` のカウンタ書き込み（`chat_daily_count` / `chat_daily_reset_date`）を service role クライアント経由に変更
- マイグレーション: `authenticated` の UPDATE grant を `display_name` / `favorite_team_slugs` の 2 カラムのみに縮小

対象外:
- チャット機能のロジック・無料枠の回数・UI の変更
- 読み取り経路の変更（`getUserProfile` の select はそのまま）

## データモデル変更

マイグレーション 1 本:

```sql
revoke update on table public.user_profiles from authenticated;
grant update (display_name, favorite_team_slugs)
  on table public.user_profiles to authenticated;
```

（`20260714084402_restrict_user_profile_updates.sql` の grant を縮小置換する。anon は既に UPDATE なし）

## API サーフェス

- `app/api/chat/[matchId]/route.ts`: カウンタの update（route 内の 2 箇所: リセット時と加算時）を service role クライアント（生成パターンは `app/api/v1/me/route.ts` の `getSupabaseAdminClient` 参照）に切り替える。**更新対象行の特定は認証済みユーザー自身の `user.id` に限定**（service role は RLS を通らないため、id の取り違えが他ユーザー書き込みになる。テストで検証する）
- 他のロジック（無料枠判定・Premium 判定・LLM 呼び出し）は変更しない

## UI サーフェス

なし。

## LLM 連携

変更なし（呼び出し回数・モデルに影響しない。むしろ枠バイパスによるコスト漏れを塞ぐ）。

## 受け入れ条件

1. `authenticated` ロールのクライアント（ユーザー JWT）から `chat_daily_count` / `chat_daily_reset_date` の UPDATE がエラーになる（テスト）
2. `authenticated` から `display_name` / `favorite_team_slugs` の UPDATE は引き続き成功する（favorites リグレッションなし）
3. チャット API を呼ぶと従来どおりカウンタが加算され、日付が変わるとリセットされる（既存テストが pass、なければ追加）
4. カウンタ更新が別ユーザーの行に書き込まれないことをテストで検証（service role 化に伴う退行防止）
5. `pnpm test`・`pnpm build` pass

### 本番適用手順

- 適用前後で `chat_daily_count` の値分布が変わらないこと（データ変更なしの grant 変更のみ）を read-only で確認

## 未解決の質問

なし。
