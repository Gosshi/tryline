# Codex 指示書: プレビューの通知を、キックオフ前の最後の 22:30（日本時間）まで待たせる

仕様書: `specs/feat-preview-notification-evening-slot.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `lib/push/notifications.ts` に純関数 `previewNotificationSlot(kickoffAt: Date): Date` を足して export する（算出方法は仕様書の API サーフェス 1）。
2. `sendContentPushNotifications` で、プレビューの行は `now` が送ってよい時刻より前なら送らず記録もしない。キックオフ後も送らず記録もしない。
3. `PushCronSummary` に `deferredPreviews` と `skippedAfterKickoff` を足す。
4. 送る順番を「レビュー（`generated_at` の新しい順）→ プレビュー（キックオフの早い順）」にする。

## 触るファイル

- `lib/push/notifications.ts`
- `tests/api/ios-push-cron.test.ts`（または同じ配置の新しいテスト）

## 守ること

- レビューの通知、試合前の通知、1 台 1 回 3 通の上限は変えない。
- 待たせたプレビューは `push_notification_log` に書かない（書くと二度と送られない）。
- `getRecentPublishedContentRows` の取得条件（`generated_at` が直近 24 時間）は変えない。
- テストの時刻はすべて `now` 引数で渡し、実時計に頼らない。

## 処理すべきエッジケース

1. キックオフがちょうど 22:30 JST → 前日の 22:30 が送ってよい時刻（仕様書の表の 4 行目）。
2. 日本時間の日付と UTC の日付が違う時間帯（JST 0:00〜8:59 のキックオフ） → 仕様書の算出方法で日本時間の暦日を取ること。表の 2 行目（日 01:30）がこのケース。
3. `kickoffAt` が解釈できない（`Date.parse` が `NaN`） → 送らず記録もせず、`failedMatches` を 1 増やす。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 送ってよい時刻の判定を外すと、受け入れ条件 2 の 1 つ目のテストが落ちること。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番に通知を送ること（テストはすべてモック）。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜7 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
