# X 自動投稿を無効化

## 背景

`notify-discord` cron が JA recap を生成するたびに X（Twitter）へ自動投稿している。X API は有料で高コストなため、投稿は手動運用に戻す。Discord に届くドラフトテキストをオーナーが手動でコピーして投稿する既存フローに戻す。

## スコープ

**対象:** `app/api/cron/notify-discord/route.ts`

**対象外:**
- `lib/x/post.ts`（関数は残す。将来の手動トリガー用途のため）
- Discord 通知フロー（変更なし）
- `buildTweetText` / `buildReplyText` の呼び出し（Discord ドラフト表示用なので残す）

## 実装詳細

### 1. クエリ条件から `x_tweet_id.is.null` を削除

**変更前（L138付近）:**
```typescript
.or(
  "discord_notified_at.is.null,and(content_type.eq.recap,x_tweet_id.is.null)",
)
```

**変更後:**
```typescript
.is("discord_notified_at", null)
```

JA の recap も EN と同様に `discord_notified_at.is.null` のみを条件にする。

### 2. X 自動投稿ブロックを削除

**削除対象（L274〜L303付近）:**
```typescript
let xTweetId: string | null = null;
if (
  content.language === "ja" &&
  content.content_type === "recap" &&
  !content.x_tweet_id
) {
  try {
    xTweetId = await postMatchRecapToX({ ... });
  } catch (error) {
    console.error("[notify-discord] X auto post failed", err);
  }
}
```

このブロックを丸ごと削除する。`xTweetId` 変数も不要になる。

### 3. update payload から `x_tweet_id` / `x_posted_at` を削除

**変更前（L306〜L316付近）:**
```typescript
const updatePayload = {
  ...(content.discord_notified_at
    ? {}
    : { discord_notified_at: new Date().toISOString() }),
  ...(xTweetId
    ? { x_posted_at: new Date().toISOString(), x_tweet_id: xTweetId }
    : {}),
};
```

**変更後:**
```typescript
const updatePayload = content.discord_notified_at
  ? {}
  : { discord_notified_at: new Date().toISOString() };
```

### 4. 不要になった import を削除

**変更前（L6）:**
```typescript
import { buildReplyText, buildTweetText, postMatchRecapToX } from "@/lib/x/post";
```

**変更後:**
```typescript
import { buildReplyText, buildTweetText } from "@/lib/x/post";
```

## 変更ファイルまとめ

| ファイル | 変更内容 |
|----------|---------|
| `app/api/cron/notify-discord/route.ts` | X 自動投稿ブロック削除、クエリ条件を `discord_notified_at.is.null` のみに戻す、import から `postMatchRecapToX` 除去、update payload から `x_tweet_id`/`x_posted_at` 除去 |

## 受け入れ条件

1. `notify-discord` cron を実行しても X への投稿が発生しない
2. Discord への通知（ドラフトテキスト含む）は引き続き正常に動作する
3. TypeScript ビルドが通る（未使用 import なし）

## 参考

- X API は有料のため手動運用が前提
- Discord に届くドラフトと URL はオーナーが手動でコピーして X に投稿する
- `match_content` の `x_tweet_id`・`x_posted_at` カラムは削除しない（将来の手動トリガー実装で使う可能性あり）