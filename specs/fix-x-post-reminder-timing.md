# X 投稿の催促: 試合後の予備の時刻を 14 時間後にし、試合後の初回の催促を深夜に送らない

## 背景

`specs/feat-x-post-reminders.md`（PR #899、2026-09-27 マージ）の時刻の決め方に、spec 側の欠陥が 2 つあった（Claude Code のミス）。

1. **試合後の予備の時刻が、レビューより必ず先に来る。**
   - 試合後の催促は、日本語レビューの公開時刻に前倒しされる。レビューが無い場合の予備として、`due_at = kickoff + 6 時間` にした（`app/api/cron/x-post-reminders/route.ts:76` の `POSTMATCH_FALLBACK_DELAY_MS`）。
   - しかし、レビューはキックオフから 12 時間たたないと作られない（`lib/cron/content-windows.ts` の `RECAP_MIN_AGE_HOURS = 12`、`recapCandidateUpperBound`）。
   - このため、**すべての代表戦で、先に「記事はまだありません」の催促が届き**、レビューが出たときには初回の催促がもう送られている。
2. **初回の催促に深夜の判定が無い。** 深夜（日本時間 0:00〜7:59）を避けているのは再度の催促だけ（`route.ts:514`）。18:30 キックオフの試合では、上の予備の催促が 0:30 に届く。

実例: オーストラリア 対 南アフリカ（2026-09-27 18:30 JST キックオフ）の試合後のタスクが、9/28 0:30 に「記事はまだありません」で送られる予定だった。本番の 1 行の `due_at` を Owner の承認を得て 9/28 8:30 JST に手で変えて回避した。

## スコープ

**対象**
1. 試合後の予備の時刻を `kickoff + (RECAP_MIN_AGE_HOURS + 2) 時間`（今の値で 14 時間）にする。
2. 試合後（`postmatch`）の初回の催促も、日本時間 0:00〜7:59 には送らない（次の回以降に回す）。

**対象外**
- 試合前（`prematch`）の初回の催促。試合前の時刻は `prematchReminderDueAt` で深夜を避けて決めている。GitHub の定期実行が遅れて深夜に届く場合も、キックオフ前の催促として役に立つ（深夜 1:30 キックオフの試合など）ので、今までどおり送る。
- 再度の催促、ボタン、タスクの作り方。
- すでに作られた行の `due_at` の後からの変更。

## データモデル変更

なし。

## API サーフェス

### `app/api/cron/x-post-reminders/route.ts`

1. `POSTMATCH_FALLBACK_DELAY_MS` を、`lib/cron/content-windows.ts` の `RECAP_MIN_AGE_HOURS` から出す:
   ```ts
   import { RECAP_MIN_AGE_HOURS } from "@/lib/cron/content-windows";

   const POSTMATCH_FALLBACK_DELAY_MS = (RECAP_MIN_AGE_HOURS + 2) * 60 * 60 * 1000;
   ```
2. `sendReminders` の初回の候補（`initial`）の条件に、「`kind === "postmatch"` かつ `isQuietHours(now)` なら除く」を足す。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. **予備の時刻:** キックオフ `2026-09-27T09:30:00Z` の代表戦の試合のタスクを作る → `postmatch` の `due_at` が `2026-09-27T23:30:00Z`（キックオフ + 14 時間）。
2. **試合後の初回は深夜に送らない:** `due_at` を過ぎた、未送信の `pending` の `postmatch` の行。
   - `now = 2026-09-27T18:00:00Z`（日本時間 3:00） → 送らない。`reminded_at` は `null` のまま。
   - 同じ行で `now = 2026-09-27T23:00:00Z`（日本時間 8:00） → 送る。
3. **試合前は深夜でも送る:** キックオフ `2026-09-27T16:30:00Z`（日本時間 1:30）、`due_at = 2026-09-27T13:30:00Z` の未送信の `prematch` の行で、`now = 2026-09-27T15:40:00Z`（日本時間 0:40） → 送る。
4. **既存テストの更新:** 予備の時刻（6 時間）を前提にしたテスト（`tests/api/x-post-reminders.test.ts` の「sends a postmatch reminder without an article after the fallback due time」など）は、14 時間に合わせて時刻だけ変える。テストは消さない。変えたテストの一覧を PR 本文に書く。
5. **壊して落ちる確認（コミットしない）:**
   - 深夜の判定を初回の催促から外すと、受け入れ条件 2 の 1 つ目のテストが落ちること
   - 深夜の判定を `postmatch` だけでなく全種類にかけると、受け入れ条件 3 のテストが落ちること
6. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

7. 次の代表戦の週末で、`x_post_tasks` の `postmatch` の行の `reminded_at` が、日本時間 0:00〜7:59 に入っていないこと。

## 未解決の質問

なし。
