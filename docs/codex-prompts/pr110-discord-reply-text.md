# PR #110 — Discord 通知に X リプライ用テキストを追加

## 背景

PR #108 で `buildReplyText` を実装したが、`notify-discord/route.ts` が呼んでいないため
Discord 通知にリプライ文面が表示されない。
現状ユーザーは URL リプライを毎回手動で組み立てる必要がある。

## スコープ

対象:
- `app/api/cron/notify-discord/route.ts` のみ

対象外:
- `lib/x/post.ts` の変更なし
- Discord 通知の構造・色・タイトルの変更なし

---

## 変更仕様

### 1. `buildReplyText` を import に追加

```ts
// Before
import { buildTweetText } from "@/lib/x/post";

// After
import { buildReplyText, buildTweetText } from "@/lib/x/post";
```

### 2. Discord embed に「X リプライ用」フィールドを追加

`draftTweet` を組み立てている箇所の直後に `replyText` を追加:

```ts
const draftTweet = buildTweetText({ ... });
const replyText = buildReplyText(content.match_id, content.language);
```

`payload` の `fields` 配列に新フィールドを追加（「X 投稿ドラフト」の直後）:

```ts
fields: [
  {
    inline: false,
    name: "X 投稿ドラフト（コピペ用）",
    value: `\`\`\`\n${draftTweet}\n\`\`\``,
  },
  {
    inline: false,
    name: "X リプライ用（URL）",           // ← 新規追加
    value: `\`\`\`\n${replyText}\n\`\`\``, // ← 新規追加
  },
  {
    inline: false,
    name: "記事",
    value: matchUrl,
  },
],
```

---

## 完了の定義

- [ ] Discord 通知に「X リプライ用（URL）」フィールドが追加されている
- [ ] `buildReplyText` の出力形式（`AI 戦術分析の全文はこちら 👇\nhttps://...`）がコードブロックで表示される
- [ ] JA・EN 両言語で正しい CTA と URL が出力される
- [ ] TypeScript エラーなし・`pnpm build` 通過
