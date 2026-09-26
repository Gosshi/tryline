# iOS のプッシュ通知が 1 通も届いていない問題を直す（サーバー側）

## 背景

iOS アプリ（App Store の審査は通過済み）のプッシュ通知が、**リリース以来 1 通も届いていない**（2026-09-26 に本番 DB と Vercel のログで確認）。

| 通知の種類 | `push_notification_log` | 送信件数の合計 | 最後の記録 |
|---|---:|---:|---|
| 試合前（`prematch`） | 30 行 | 0 | 2026-09-25 |
| プレビュー（`preview`） | 13 行 | 0 | 2026-08-23 |
| レビュー（`recap`） | 13 行 | 0 | 2026-08-26 |

- **試合前の通知**は、`notify_prematch` を有効にした端末が無いので、0 件で正しい。
- **プレビューとレビューの通知**は、`notify_content = true` の端末が 2 台ある（`expo_push_tokens`。うち 1 台はログイン済みユーザー。2 台とも `team_slugs = []`）。#734（2026-08-27）で「応援チームを選んでいない端末にも届ける」ように直した結果、送信の処理に進むようになった。
- **その翌日から、送信のたびに失敗している。** Vercel のログ（`/api/cron/send-content-notifications`）:
  - `[push] Failed to send content notification. Error: Cannot find module '../package.json'`
  - 呼び出し元: `expo-server-sdk@6.1.0/build/ExpoClient.js`
  - 直近 7 日で 257 回。初回 2026-08-28 05:06 UTC、最後 2026-09-26 01:11 UTC
- **原因:** `expo-server-sdk` の `ExpoClient.js:165` が、送信のたびに `require('../package.json').version` で自分の `package.json` を読む。Next.js が本番用にサーバーのコードをまとめるとき、この `package.json` が含まれないため失敗する。
- **失敗が見えなかった理由:**
  - `lib/push/notifications.ts:393` の `catch` がエラーを握ってログに出すだけで、`failedMatches` を数えるだけになっている。
  - route（`app/api/cron/send-content-notifications/route.ts`）は常に 200 を返し、GitHub Actions（`cron-send-content-notifications.yml`、30 分ごと）は成功のまま。
  - 送信の後ろにある `push_notification_log` への書き込みに届かないので、失敗した回は記録の行も残らない。
- **直したときの注意:** 送信の対象は「直近 24 時間に公開された記事のうち、`push_notification_log` に記録が無いもの」（`notifications.ts:312`）。直した直後の最初の回で、過去 24 時間の記事の通知がまとめて送られる。週末なら 1 台に 20〜30 通が一度に届く。

## スコープ

**対象**
1. `expo-server-sdk` を、Next.js のサーバーのコードをまとめる対象から外し、実行時に `node_modules` から読み込ませる（`package.json` を読めるようにする）。
2. 送信の失敗を外から見えるようにする（route が失敗を返し、GitHub Actions が失敗になる）。
3. 1 回の送信で、1 台の端末に送る通知の数に上限を設ける（直した直後のまとめ送りと、週末の大量の通知を防ぐ）。

**対象外**
- iOS アプリ側の変更（不要）。
- 応援チームを選んでいない端末に、どの記事の通知を送るかの方針の変更（全記事のまま）。
- Web Push。

## データモデル変更

なし。

## API サーフェス

### 1. ビルドの設定（`next.config.ts`）

- `serverExternalPackages: ["expo-server-sdk"]` を足す。
- **本番のビルドで `package.json` が読めることを確かめる方法**も PR で示す（例: `next build` のあと、`.next/server/app/api/cron/send-content-notifications/route.js.nft.json` の中に `expo-server-sdk/package.json` への参照があること）。

### 2. 失敗を見えるようにする

- `sendContentPushNotifications` の結果の `failedMatches` が 1 以上なら、`app/api/cron/send-content-notifications/route.ts` は **HTTP 500** を返す（結果の中身は今までどおり返す）。これで GitHub Actions が失敗として表示する。
- 試合前の通知の route（`app/api/cron/send-prematch-notifications/route.ts`）も同じにする。

### 3. 1 回の送信の上限（`lib/push/notifications.ts`）

- 1 回の送信（cron 1 回）で、**1 台の端末に送る通知は最大 3 通**にする。定数 `MAX_NOTIFICATIONS_PER_TOKEN_PER_RUN = 3`。
- 公開の新しい順に 3 本を選んで送る。上限を超えて送らなかった記事も、`push_notification_log` に `sent_count = 0` で記録し、次の回に再送しない。
  - 記録の行の意味が分かるよう、送らなかった分を区別できるようにする。今のテーブルに列を足さずに済むよう、`sent_count = 0` で記録してよい（試合前の通知と同じ扱い）。
- 端末ごとの上限なので、送る記事の選び方は端末ごとに変わりうる（応援チームを選んだ端末は、その試合の記事だけが対象）。
- 試合前の通知にも同じ上限を適用する。

## UI サーフェス

なし（iOS アプリは変えない）。

## LLM 連携

なし。

## 受け入れ条件

1. `next.config.ts` に `serverExternalPackages: ["expo-server-sdk"]` がある。PR 本文に、ビルドで `package.json` が読めることを確かめた結果（上の方法など）を書く。
2. **失敗の表示:** `sendExpoPushNotifications` が例外を投げるモックで、`/api/cron/send-content-notifications` が HTTP 500 を返し、本文に `failedMatches` が入る。すべて成功したときは今までどおり 200。試合前の通知の route も同じ。
3. **上限:**
   - `notify_content = true`・`team_slugs = []` の端末 1 台と、直近 24 時間に公開された記事 5 本がある場合、送信は 3 通（新しい順に 3 本）で、5 本とも `push_notification_log` に記録される（送った 3 本は `sent_count >= 1`、残りの 2 本は `sent_count = 0`）。
   - 次の回に同じ 5 本があっても、何も送らない。
   - 確認方法: 上限を外すと、1 つ目のテストが落ちること。
4. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

5. デプロイ後の最初の数回の cron で、Vercel のログに `Cannot find module '../package.json'` が出ないこと、`push_notification_log` に `sent_count >= 1` の行（`preview` または `recap`）ができることを確かめる。
6. Owner の端末に通知が届いたかを Owner に確かめてもらう。

## 未解決の質問

なし。応援チームを選んでいない端末への通知の量（週末に 20〜30 本の記事が出る）は、上限 3 通／回で当面は抑える。量の方針を変えるかは、通知が届くようになってから Owner が判断する。
