# PR #93 — X 自動投稿を廃止し Discord 通知に切り替え

## 背景

X API の従量課金コスト（約 $0.20/ツイート）と品質確認ニーズから、
自動 X 投稿をやめて **Discord チャンネルへの下書き通知** に変更する。

Owner が Discord で内容を確認し、問題なければ手動で X に投稿する。
日本語・英語でそれぞれ別の Discord チャンネルに送信する。

## スコープ

対象:
- `supabase/migrations/<timestamp>_add_discord_notified_at.sql`（新規）
- `app/api/cron/post-to-x/route.ts` → `app/api/cron/notify-discord/route.ts` にリネーム＆実装変更
- `lib/x/post.ts`（`buildTweetText` 関数を追加）

対象外:
- `lib/cron/orchestrate.ts` — 変更不要
- `lib/x/post.ts` の `postMatchRecapToX` — 削除しない（将来の手動投稿用に残す）

---

## 1. マイグレーション — `discord_notified_at` カラム追加

```sql
ALTER TABLE match_content
  ADD COLUMN IF NOT EXISTS discord_notified_at timestamptz;
```

`x_posted_at` は既存のまま残す（手動 X 投稿後に更新するため）。

---

## 2. `lib/x/post.ts` — ドラフト生成関数を追加

既存の `postMatchRecapToX` 内のテキスト組み立てロジックを
純粋関数 `buildTweetText` として抽出・export する。
`postMatchRecapToX` はこれを呼ぶ形にリファクタリングする。

```ts
export function buildTweetText(params: XPostParams): string {
  // 既存の postMatchRecapToX 内のテキスト組み立てロジックをそのまま移植
  // tweet() 呼び出しは含めない
  return text;
}

export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials(params.language));
  const text = buildTweetText(params);
  const { data } = await client.v2.tweet(text);
  return data.id;
}
```

---

## 3. `app/api/cron/notify-discord/route.ts` の実装

`app/api/cron/post-to-x/` ディレクトリを `app/api/cron/notify-discord/` にリネームし、
`route.ts` を以下の仕様で実装する。

### 環境変数

```
DISCORD_WEBHOOK_JA   # 日本語チャンネル用 Webhook URL
DISCORD_WEBHOOK_EN   # 英語チャンネル用 Webhook URL
```

`lib/env.ts` の `getServerEnv` に追加して型安全に参照する。

### クエリ変更

`x_posted_at` の代わりに `discord_notified_at` でフィルタする:

```ts
.is("discord_notified_at", null)
```

それ以外のフィルタ（`status = published`、`kickoff_at >= 7 days ago`、`limit(5)`）は既存と同じ。

### キックオフ済みプレビューのスキップ（PR #92 相当）

```ts
const now = new Date().toISOString();

if (content.content_type === "preview" && match.kickoff_at < now) {
  await db.from("match_content")
    .update({ discord_notified_at: now })
    .eq("id", content.id);
  continue;
}
```

### Discord メッセージ送信

```ts
async function postToDiscord(webhookUrl: string, payload: object): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status}`);
}
```

各コンテンツに対して以下の形式で送信する:

```ts
const score =
  match.home_score !== null && match.away_score !== null
    ? `${match.home_score} - ${match.away_score}`
    : "vs";

const typeLabel =
  content.content_type === "preview"
    ? content.language === "en" ? "📋 Preview" : "📋 プレビュー"
    : content.language === "en" ? "🏉 Review" : "🏉 レビュー";

const draftTweet = buildTweetText({
  awayScore: match.away_score,
  awayTeamName: awayDisplayName,
  competitionLabel,
  contentType: content.content_type,
  homeScore: match.home_score,
  homeTeamName: homeDisplayName,
  language: content.language,
  matchId: content.match_id,
  recapExcerpt: createRecapExcerpt(content.content_md_ja),
});

const matchUrl = `https://www.trylinerugby.com/matches/${content.match_id}${
  content.language === "en" ? "/en" : ""
}`;

const payload = {
  embeds: [
    {
      title: `${typeLabel} | ${competitionLabel}`,
      description: `**${homeDisplayName} ${score} ${awayDisplayName}**`,
      color: content.content_type === "preview" ? 0x3b82f6 : 0x22c55e,
      fields: [
        {
          name: "X 投稿ドラフト（コピペ用）",
          value: `\`\`\`\n${draftTweet}\n\`\`\``,
          inline: false,
        },
        {
          name: "記事",
          value: matchUrl,
          inline: false,
        },
      ],
    },
  ],
};

const webhookUrl =
  content.language === "en"
    ? requireEnv("DISCORD_WEBHOOK_EN")
    : requireEnv("DISCORD_WEBHOOK_JA");

await postToDiscord(webhookUrl, payload);
```

### `discord_notified_at` を更新

Discord 送信成功後:

```ts
await db.from("match_content")
  .update({ discord_notified_at: new Date().toISOString() })
  .eq("id", content.id);
```

### レスポンス

```ts
return NextResponse.json({ notified: results.length, results, status: "ok" });
```

---

## 4. Vercel 環境変数の追加

Vercel ダッシュボードで以下を追加:
- `DISCORD_WEBHOOK_JA`（Discord の日本語チャンネルの Webhook URL）
- `DISCORD_WEBHOOK_EN`（Discord の英語チャンネルの Webhook URL）

Discord チャンネルの Webhook URL は
チャンネル設定 → 連携サービス → ウェブフック から取得する。

---

## 完了の定義

- [ ] `app/api/cron/notify-discord/route.ts` が存在し、`post-to-x/route.ts` は削除されている
- [ ] `match_content` に `discord_notified_at` カラムが追加されている
- [ ] cron を叩くと Discord の JA/EN チャンネルそれぞれに通知が届く
- [ ] 通知 embed にドラフトツイート（コードブロック）と記事リンクが含まれる
- [ ] キックオフ済みプレビューはスキップされ `discord_notified_at` が埋まる
- [ ] `x_posted_at` カラムと `postMatchRecapToX` 関数は残っている
- [ ] TypeScript エラーなし・`pnpm build` 通過
