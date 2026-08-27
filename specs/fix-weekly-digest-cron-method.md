# 週次ニュースレターの cron が毎週 405 になっている

## 背景

**週次ニュースレターは一度も自動配信されていない。**

`vercel.json` は毎週月曜 12:00 UTC に cron を登録している。

```json
{
  "crons": [
    { "path": "/api/cron/weekly-digest", "schedule": "0 12 * * 1" }
  ]
}
```

`app/api/cron/weekly-digest/route.ts` の export は **`POST` だけ**である。

```
$ grep -n "^export async function" app/api/cron/weekly-digest/route.ts
164:export async function POST(request: Request) {
```

**Vercel Cron は設定された path へ HTTP GET を送る**（[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)）。GET ハンドラが無いルートは Next.js が 405 Method Not Allowed を返す。代替で POST を叩く GitHub Actions workflow も存在しない（`.github/workflows` に `weekly-digest` 該当なし）。

したがって 2026-08-17・08-24 の実行はいずれも本文に到達していない。

### 影響

`email_subscribers` は **1 行（`status = confirmed`）**。この購読者は登録から2週間以上、**確認メール以外を1通も受け取っていない**。登録経路（フォーム → 確認メール → confirmed 保存）は完走しており壊れていないが、その後の価値提供が0で止まっている。

### 環境変数は揃っている

`vercel env ls` で確認済み（値は未参照、名前と対象環境のみ）。

| 変数 | 環境 |
|---|---|
| `RESEND_API_KEY` | Preview, Production |
| `DISCORD_WEBHOOK_WEEKLY_DIGEST` | Preview, Production |
| `CRON_SECRET` | Preview, Production |

**環境変数の欠落は原因ではない。** 原因は HTTP メソッドの不一致だけである。

## スコープ

対象:
- `app/api/cron/weekly-digest/route.ts` に GET ハンドラを追加する
- 同ルートの Discord 依存を外し、Discord が未設定でもメールを送れるようにする
- `tests/api/weekly-digest.test.ts` の追記

対象外:
- ニュースレターの本文プロンプト（`SYSTEM_PROMPT` / `buildUserPrompt`）
- 配信対象の期間ロジック（`getLastWeekendRange`）
- `lib/newsletter.ts` の送信・購読解除処理
- 登録フォームの文言・配置・計測（`feat-newsletter-funnel-instrumentation.md` の対象）
- 他の cron ルート

## データモデル変更

**なし。**

## API サーフェス

`/api/cron/weekly-digest` に `GET` を追加する。**`POST` は残す**（手動実行と既存テストが使っている）。

両者は同一の処理を呼び、**同一の JSON レスポンスを返す**。レスポンス形状は現状から変更しない。

| 分岐 | レスポンス | HTTP |
|---|---|---|
| 認証失敗 | `{ error: "unauthorized" }` | 401 |
| 対象試合0件 | `{ matches: 0, skipped: true }` | 200 |
| 正常 | `{ chunks, matches, newsletter, status: "ok" }` | 200 |

### 認証

`assertCronAuthorized`（`lib/cron/auth.ts`）は `Authorization: Bearer ${CRON_SECRET}` ヘッダのみを見ており、**メソッドに依存しない**。

```ts
export function assertCronAuthorized(request: Request): void {
  const { CRON_SECRET } = getServerEnv();
  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${CRON_SECRET}`) {
    throw new CronUnauthorizedError();
  }
}
```

Vercel Cron は `CRON_SECRET` が設定されていれば同ヘッダを付与する。**認証まわりの変更は不要。既存の `assertCronAuthorized` をそのまま GET でも呼ぶこと。**

## 実装方針

### 1. 既存の本文を共通関数へ切り出し、GET / POST の両方から呼ぶ

現在の `POST` 本体（`app/api/cron/weekly-digest/route.ts:164` 以降）を `runWeeklyDigest(request: Request)` に移し、次の形にする。

```ts
export async function GET(request: Request) {
  return runWeeklyDigest(request);
}

export async function POST(request: Request) {
  return runWeeklyDigest(request);
}
```

**`try` / `catch` の構造、エラー時のログとレスポンス、`CronUnauthorizedError` の 401 変換をそのまま維持すること。** 処理内容は1文字も変えない。

### 2. Discord 未設定でもメールを送る

現在は Discord webhook が無いと、本文生成の前に return する（`app/api/cron/weekly-digest/route.ts:168-171`）。

```ts
const { DISCORD_WEBHOOK_WEEKLY_DIGEST } = getServerEnv();
if (!DISCORD_WEBHOOK_WEEKLY_DIGEST) {
  return NextResponse.json({ reason: "no_webhook", skipped: true });
}
```

これを**早期 return ではなく、Discord 投稿ステップの条件**に変える。

- webhook があるとき: 現状どおり、生成 → Discord へ chunk 投稿 → メール送信
- webhook が無いとき: 生成 → **Discord をスキップ** → メール送信
- レスポンスに Discord をスキップしたことが分かるフィールドを足す（例: `discord: "skipped"`）。既存フィールドは削らない

**この変更は現在の本番挙動を変えない。** `DISCORD_WEBHOOK_WEEKLY_DIGEST` は Production に設定済みのため、現状は常に webhook あり分岐を通る。将来 webhook が外れたときにメールまで巻き添えで止まることを防ぐための保険である。

## UI サーフェス

**なし。**

## LLM 連携

既存のまま。ナラティブ生成に `MODELS.NARRATIVE` を1回呼ぶ（`app/api/cron/weekly-digest/route.ts` 内の `getOpenAIClient().chat.completions.create`）。**モデル・プロンプト・呼び出し回数を変更しない。**

## 受け入れ条件

1. `GET /api/cron/weekly-digest` が、正しい `Authorization: Bearer ${CRON_SECRET}` ヘッダ付きで呼ばれたとき、`POST` と**同じ JSON** を返す。
2. `GET` が、`Authorization` ヘッダ無し・または不一致のとき `401` と `{ error: "unauthorized" }` を返す。
3. `POST` の既存の挙動・レスポンスが変わっていない。既存テストが**修正なしで**通る。
4. `DISCORD_WEBHOOK_WEEKLY_DIGEST` が未設定のとき、Discord へ投稿せず、**`sendWeeklyDigestEmails` は呼ばれる**。
5. `DISCORD_WEBHOOK_WEEKLY_DIGEST` が設定済みのとき、Discord 投稿とメール送信の**両方**が現状どおり実行される。
6. 対象試合0件のとき、`{ matches: 0, skipped: true }` を返し、LLM もメールも呼ばない（現状維持）。
7. 上記1〜6を `tests/api/weekly-digest.test.ts` に追加する。
8. `pnpm lint`、`pnpm tsc --noEmit`、`pnpm test` がすべて通る。
9. `vercel.json` を変更していない。

## やってはいけないこと

- `POST` を削除しないこと。手動実行の経路として残す。
- `vercel.json` の schedule を変えないこと。毎週月曜 12:00 UTC のまま。
- `assertCronAuthorized` を書き換えたり、GET だけ認証を緩めたりしないこと。
- `getLastWeekendRange` の期間計算に手を入れないこと。
- ニュースレターの本文プロンプトを「ついでに」改善しないこと。本 spec は配線の修復だけを行う。
- `lib/newsletter.ts` の `sendWeeklyDigestEmails` / `RESEND_API_KEY` 未設定時の `skipped: true` 挙動を変えないこと。

## 未解決の質問

なし。
