# SNS 運用: X への自動投稿で試合後の投稿遅延を解消する

## 背景

現在の X 投稿フローは以下の通り手動運用:
1. `notify-discord` cron が Discord に通知を送る
2. Owner がドラフトをコピーして X に投稿
3. Owner がリプライで URL を投稿

この手動フローには以下の問題がある:
- Owner の作業時間帯外（深夜・早朝の海外試合）は投稿が数時間以上遅延
- インプレッションは試合終了直後が最も高いため、遅延は機会損失に直結
- 1 日に複数試合がある場合、投稿漏れが発生しやすい

目標: `recap`（レビュー）生成完了後に X JA アカウントへ自動投稿し、遅延をゼロにする。
`preview` は引き続き手動（試合前のタイミング調整が必要なため）。

## スコープ

対象:
- `app/api/cron/notify-discord/route.ts` または新規 cron route — X API 呼び出しを追加
- `lib/x/post.ts` — 投稿・リプライ送信関数を追加
- `.env.example` — X API credentials の変数名を追加（値なし）

対象外:
- `preview` の自動投稿（タイミング制御が複雑なため手動維持）
- EN アカウントへの自動投稿（フェーズ 1 では JA のみ）
- 削除・訂正ロジック

## データモデル変更

### `match_content` テーブルへのカラム追加（マイグレーション必要）

```sql
ALTER TABLE match_content
  ADD COLUMN IF NOT EXISTS x_tweet_id TEXT,          -- 投稿済みツイートの ID
  ADD COLUMN IF NOT EXISTS x_posted_at TIMESTAMPTZ;  -- 自動投稿日時
```

例: `x_tweet_id = "1234567890123456789"`, `x_posted_at = "2026-05-23T10:00:00+09:00"`

`x_tweet_id` が NULL でない場合は投稿済みとみなし、二重投稿を防ぐ。

### マイグレーションファイル

`supabase/migrations/<timestamp>_add_x_post_fields_to_match_content.sql`

## API サーフェス

### X API v2 エンドポイント

```
POST https://api.twitter.com/2/tweets
Authorization: OAuth 1.0a (User Context — @tryline_rugbyjp)
```

必要な credentials（`.env.example` に追記すること）:
```
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

### `lib/x/post.ts` への追加

```typescript
export async function postTweetWithReply(params: {
  tweetText: string;  // メインツイート（URL なし）
  replyText: string;  // リプライ（URL 付き）
}): Promise<{ tweetId: string; replyId: string }> {
  // 1. メインツイートを投稿 → tweetId を取得
  // 2. in_reply_to_tweet_id: tweetId を指定してリプライを投稿
}
```

## UI サーフェス

なし

## LLM 連携

なし

## 受け入れ条件

1. `recap` 生成後の Discord 通知と同時に X JA アカウントへ自動投稿される
2. メインツイート（URL なし）の後にリプライ（URL 付き）が自動で続投される
3. `match_content.x_tweet_id` が設定済みのレコードに対して二重投稿しない
4. X API エラー時（rate limit / 認証失敗）は Discord 通知のみ送り、
   `x_tweet_id` は NULL のまま残す（次回 cron でリトライ可能）
5. マイグレーション適用後に `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- X API v2 の OAuth 1.0a credentials は Owner が Twitter Developer Portal で取得し、
  Vercel 環境変数に設定すること
- EN アカウントの自動化は将来フェーズで検討（現時点スコープ外）
- X API Free プランは月 500 件の投稿上限あり。月の試合数が 250 試合以上になれば
  Basic プラン（$100/月）への移行が必要。Owner が確認すること