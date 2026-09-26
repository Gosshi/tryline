# Codex 指示書: iOS のプッシュ通知が 1 通も届いていない問題を直す（サーバー側）

仕様書: `specs/fix-expo-push-server-bundle.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

1. `expo-server-sdk@6.1.0` の `build/ExpoClient.js:165` が送信のたびに `require('../package.json')` を読み、本番のビルドで `Cannot find module '../package.json'` になっている（2026-08-28 から 257 回以上）。`next.config.ts` に `serverExternalPackages: ["expo-server-sdk"]` を足して、実行時に `node_modules` から読ませる。
2. 送信の失敗が `lib/push/notifications.ts:393` の `catch` で握られ、route は 200 のまま。`failedMatches >= 1` なら route が 500 を返すようにする（内容の通知と試合前の通知の両方）。
3. 直した直後に過去 24 時間分の通知がまとめて届かないよう、1 回の送信で 1 台に送る通知を最大 3 通にする。送らなかった分も `sent_count = 0` で記録し、再送しない。

## 触るファイル

- `next.config.ts`
- `app/api/cron/send-content-notifications/route.ts`、`app/api/cron/send-prematch-notifications/route.ts`
- `lib/push/notifications.ts`
- テスト

## 守ること

- iOS アプリ（tryline-mobile）は変えない。
- 送信の対象の選び方（直近 24 時間に公開された記事、応援チームの判定、`DeviceNotRegistered` の端末を消す処理）は、上限を足す以外は変えない。
- 本番に通知を送らない（テストはすべてモック）。

## 処理すべきエッジケース

1. 端末ごとに対象の記事が違う（応援チームを選んだ端末は、その試合の記事だけ）。上限は端末ごとに数える。**記事単位で「送った／送らなかった」を記録する今の形（`match_id` と `kind` ごとに 1 行）との整合をどう取るかを決めて、PR 本文に書く**（例: 記事ごとに「1 台でも送ったか」で `sent_count` を数え、どの端末にも送らなかった記事は `sent_count = 0` で記録する）。
2. `serverExternalPackages` を足したことで、ほかのルートのビルドに影響が出ないかを `next build` で確かめる。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- `next build` を実行し、`.next/server/app/api/cron/send-content-notifications/route.js.nft.json` に `expo-server-sdk/package.json` への参照が含まれることを確かめ、PR 本文に書く。
- 「壊して落ちる」確認（コミットしない）: 上限を外すと受け入れ条件 3 のテストが落ちること。内容と結果を PR 本文に書く。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜4 のそれぞれについて、確認の方法と結果
  - エッジケース 1 の扱い
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
