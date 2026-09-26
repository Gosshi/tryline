# プレビューの通知を、キックオフ前の最後の 22:30（日本時間）まで待たせる

## 背景

- iOS のプレビュー通知は、プレビューが公開されてから最初の送信（`cron-send-content-notifications.yml`、30 分ごと。実際は遅れる）で送られる（`lib/push/notifications.ts` の `sendContentPushNotifications`）。
- プレビューは D030 の時刻（前日 15:00 以降かつキックオフ 24 時間前以降）に作られる。ChatGPT の調べ物は 20:00 に実行し、Owner がその結果を Discord で貼るのはその後。
- `specs/feat-preview-regenerate-on-manual-facts.md`（PR #896）で、事実を貼ればプレビューはその場で作り直される。**ただし通知はすでに作り直し前の版で送られている。** 通知は `push_notification_log`（`match_id` と `kind` ごとに1行）で二度と送らないので、作り直した版は通知されない。
- 実例（2026-09-26）: オーストラリア 対 南アフリカのプレビューが 20:05 に事実なしで公開された。事実が入ったのは 9/27 0:01。

**方針:** プレビューの通知は、**キックオフ前の最後の 22:30（日本時間）を過ぎてから**送る。Owner は ChatGPT の結果を 22:00 までに貼る運用にする。レビューの通知は変えない（レビューは調べ物の締め切り 20:30 より後に作るので、この問題は起きない）。

## スコープ

**対象**
- `sendContentPushNotifications` でのプレビュー（`kind = "preview"`）の送信時刻の判定。
- 1 回の送信の中で、送る順番。

**対象外**
- レビューの通知の時刻。
- 試合前の通知（`prematch`）。
- 1 台 1 回 3 通の上限（`MAX_NOTIFICATIONS_PER_TOKEN_PER_RUN`）。
- iOS アプリ。

## データモデル変更

なし。

## API サーフェス

### 1. 送ってよい時刻（`lib/push/notifications.ts`）

新しい純関数を足して export する:

```ts
export function previewNotificationSlot(kickoffAt: Date): Date
```

- 返り値は「キックオフより前の、最後の 22:30（日本時間）」。
- 算出方法（22:30 JST = 13:30 UTC、同じ暦日）:
  1. `jst = new Date(kickoffAt.getTime() + 9 * 60 * 60 * 1000)`（日本時間の暦日を取るためだけに使う）
  2. `slot = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 13, 30)`
  3. `slot >= kickoffAt.getTime()` なら `slot -= 24 * 60 * 60 * 1000`
- 例（すべて日本時間）:

| キックオフ | 送ってよい時刻 |
|---|---|
| 日 18:30 | 土 22:30 |
| 日 01:30 | 土 22:30 |
| 土 23:00 | 土 22:30 |
| 土 22:30 ちょうど | 金 22:30 |

### 2. 判定（`sendContentPushNotifications` のループ）

プレビューの行について、今の「すでに記録済みなら飛ばす」の判定の後、`mapContentRow` の後に次を足す:

- `now < previewNotificationSlot(kickoff)` → 送らない。**`push_notification_log` に記録しない**（次の回以降に送るため）。`summary.deferredPreviews` を 1 増やす。
- `now >= kickoff` → 送らない。記録しない。`summary.skippedAfterKickoff` を 1 増やす。
- それ以外 → 今までどおり送る。

`PushCronSummary` と `EMPTY_SUMMARY`、`addSummary` に `deferredPreviews` と `skippedAfterKickoff` を足す（0 始まり）。

**24 時間の窓について:** 対象の行は `getRecentPublishedContentRows` の「`generated_at` が直近 24 時間」で絞られている。プレビューはキックオフの 24 時間前より後に作られる（D030）ので、`now < kickoff` の間は `generated_at > now - 24h` が成り立ち、窓から外れない。この取得条件は変えない。

### 3. 送る順番

今は `generated_at` の新しい順。これを次にする（1 台 3 通の上限で、どれが残るかを決めるため）:

1. レビュー（`recap`）を先に、`generated_at` の新しい順
2. その後にプレビュー（`preview`）を、**キックオフの早い順**

理由: 土曜 22:30 の回では、その日の午後の試合のレビュー（20:30 以降に作られる）と翌日のプレビューが同じ回に並ぶ。応援チームを選んでいない端末では、終わった試合の結果を先に届け、プレビューは次に始まる試合から届ける。

## UI サーフェス

なし（通知の文面は変えない）。

## LLM 連携

なし。

## 受け入れ条件

1. `previewNotificationSlot` が上の表の 4 例でそれぞれ期待どおりの時刻を返す（テストは UTC の ISO 文字列で書く。例: キックオフ `2026-09-27T09:30:00Z` → `2026-09-26T13:30:00Z`）。
2. **待たせる:** キックオフ `2026-09-27T09:30:00Z` の公開済みプレビュー、応援チームなしの端末1台。
   - `now = 2026-09-26T11:30:00Z`（土 20:30 JST） → 送らない。`push_notification_log` への書き込みなし。`deferredPreviews = 1`。
   - 同じデータで `now = 2026-09-26T13:30:00Z`（土 22:30 JST） → 1 通送り、記録される。
3. **キックオフ後:** `now = 2026-09-27T09:30:00Z` → 送らない、記録しない、`skippedAfterKickoff = 1`。
4. **レビューは変えない:** 公開済みレビューは、`now` が何時でも今までどおり最初の回で送られる。
5. **順番:** 応援チームなしの端末1台、同じ回に公開済みのレビュー2本と、送ってよい時刻を過ぎたプレビュー4本（キックオフの時刻がばらばら） → 送るのはレビュー2本と、キックオフが最も早いプレビュー1本。残りのプレビュー3本は、今の上限の扱い（#894）のとおり `sent_count = 0` で記録される。
   - キックオフの時刻は `mapContentRow` が返す `PushMatch.kickoffAt` を `Date.parse` して使う。
6. **壊して落ちる確認（コミットしない）:** 判定 2 の `now < previewNotificationSlot(...)` を外すと、受け入れ条件 2 の 1 つ目のテストが落ちること。
7. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

8. 次の土曜について、`push_notification_log` の `kind = 'preview'` の行の `sent_at` が、すべて 22:30 JST 以降になっていること。

## 運用（Owner）

- ChatGPT の調べ物（20:00）の結果は、**22:00 までに** Discord で貼る。22:00 を過ぎても事実は記事に入るが、通知は作り直し前の版で出ている可能性がある。

## 未解決の質問

なし。
