# Codex 指示書: X 投稿の催促の時刻を直す（試合後の予備の時刻・深夜）

仕様書: `specs/fix-x-post-reminder-timing.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `app/api/cron/x-post-reminders/route.ts` の `POSTMATCH_FALLBACK_DELAY_MS` を、`lib/cron/content-windows.ts` の `RECAP_MIN_AGE_HOURS` から `(RECAP_MIN_AGE_HOURS + 2)` 時間として出す。
2. `sendReminders` の初回の候補から、`postmatch` かつ日本時間 0:00〜7:59（既存の `isQuietHours`）のものを除く。

## 触るファイル

- `app/api/cron/x-post-reminders/route.ts`
- `tests/api/x-post-reminders.test.ts`

## 守ること

- 試合前（`prematch`）の初回の催促には深夜の判定をかけない。
- 再度の催促・ボタン・タスクの作り方は変えない。
- 深夜の判定は既存の `isQuietHours` を使う（同じ計算を書き直さない）。
- 既存のテストは消さない。予備の時刻（6 時間）を前提にしたテストは時刻だけ合わせる。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 仕様書の受け入れ条件 5 の 2 つ。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番 DB の `x_post_tasks` の既存の行を変えること。
- 本番の Discord に送信すること（テストはモック）。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜6 のそれぞれについて、確認の方法と結果
  - 時刻を合わせた既存テストの一覧
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
