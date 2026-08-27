`/specs/fix-weekly-digest-cron-method.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

**週次ニュースレターは一度も自動配信されていません。**

`vercel.json` は毎週月曜 12:00 UTC に `/api/cron/weekly-digest` を登録していますが、そのルートの export は **`POST` だけ**です。

```
$ grep -n "^export async function" app/api/cron/weekly-digest/route.ts
164:export async function POST(request: Request) {
```

**Vercel Cron は GET を送ります**（https://vercel.com/docs/cron-jobs）。GET ハンドラが無いので毎週 405 になります。POST を叩く代替の GitHub Actions workflow もありません。

結果、`email_subscribers` の唯一の購読者（confirmed）は、登録から2週間以上**確認メール以外を1通も受け取っていません**。

環境変数（`RESEND_API_KEY` / `DISCORD_WEBHOOK_WEEKLY_DIGEST` / `CRON_SECRET`）はすべて Production に設定済みです。**環境変数は原因ではありません。**

## 直すのは2点です

**1. GET ハンドラを追加する**

現在の `POST` 本体を `runWeeklyDigest(request: Request)` に切り出し、`GET` と `POST` の両方から呼んでください。

```ts
export async function GET(request: Request) {
  return runWeeklyDigest(request);
}

export async function POST(request: Request) {
  return runWeeklyDigest(request);
}
```

**`POST` は削除しないでください。** 手動実行の経路として残します。

**処理内容は1文字も変えないでください。** `try` / `catch` の構造、エラーログ、`CronUnauthorizedError` の 401 変換をそのまま維持してください。

認証は変更不要です。`assertCronAuthorized`（`lib/cron/auth.ts`）は `Authorization: Bearer ${CRON_SECRET}` ヘッダしか見ておらず、メソッドに依存しません。**GET だけ認証を緩めるようなことはしないでください。**

**2. Discord 未設定でもメールを送れるようにする**

現在は webhook が無いと本文生成の前に return します（`app/api/cron/weekly-digest/route.ts:168-171`）。

```ts
if (!DISCORD_WEBHOOK_WEEKLY_DIGEST) {
  return NextResponse.json({ reason: "no_webhook", skipped: true });
}
```

これを早期 return ではなく、**Discord 投稿ステップだけの条件**にしてください。webhook が無いときは Discord をスキップしてメール送信まで進みます。レスポンスにスキップが分かるフィールド（例 `discord: "skipped"`）を足し、既存フィールドは削らないでください。

**この変更は現在の本番挙動を変えません。** webhook は Production に設定済みなので、今は常に webhook あり分岐を通ります。将来 webhook が外れたときにメールまで巻き添えで止まるのを防ぐ保険です。

## 触ってはいけないもの

- `vercel.json`（schedule は毎週月曜 12:00 UTC のまま）
- `assertCronAuthorized`
- `getLastWeekendRange` の期間計算
- `SYSTEM_PROMPT` / `buildUserPrompt` などニュースレター本文のプロンプト
- `lib/newsletter.ts`（`RESEND_API_KEY` 未設定時の `skipped: true` 挙動を含む）
- LLM のモデル・呼び出し回数（`MODELS.NARRATIVE` を1回のまま）

**本文の質を「ついでに」改善しないでください。** 今回は配線の修復だけです。

## 完了の定義

- spec の受け入れ条件1〜9をすべて満たす
- 既存の `tests/api/weekly-digest.test.ts` が**修正なしで**通る（POST の挙動を変えていない証明）
- GET / 401 / Discord 未設定時のメール送信を同ファイルに追加する
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る

## PR に書いてほしいこと

次の月曜（2026-08-31 12:00 UTC）に実際に配信されるかが検証ポイントです。対象の週末（8/29〜8/30）には**試合が1件あります**（8/29 15:10 UTC、本番DB確認済み）。つまり `matches: 0, skipped: true` にはならず、本文生成とメール送信まで到達するはずです。

PR にはこの前提を書き、マージ後に Owner が Vercel のログで確認できるよう、**成功時のレスポンス JSON の形**を明記してください。
