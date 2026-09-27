# Codex 指示書: 代表戦の X 投稿を忘れないための催促（Discord・完了ボタン付き）

仕様書: `specs/feat-x-post-reminders.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

0. `app/api/cron/notify-discord/route.ts` から、LLM で X の投稿例を作る処理（`generatePreviewThread`・`generateImpressionTweet`）を外し、使われなくなったファイルとそのテストを削除する。
1. マイグレーションで `x_post_tasks` を作る（RLS 有効、ポリシーなし）。
2. 新規 `lib/x/post-reminders.ts` に `CLUB_COMPETITION_FAMILIES`、`isInternationalCompetitionFamily`、`prematchReminderDueAt` を作る。
3. 新規 `app/api/cron/x-post-reminders/route.ts` で、タスクの作成・前倒し・逃した判定・初回と再度の催促を行う。
4. Discord のボットのトークンでチャンネルにメッセージを作り、ボタン 2 つを付ける。
5. `app/api/discord/interactions/route.ts` に、ボタン（MESSAGE_COMPONENT）の分岐を足す。
6. `.github/workflows/cron-send-content-notifications.yml` に、新しい route を呼ぶステップを足す（`if: always()`）。
7. `lib/env.ts` に `DISCORD_BOT_TOKEN` と `DISCORD_X_REMINDER_CHANNEL_ID` を足す（optional）。

## 触るファイル

- `app/api/cron/notify-discord/route.ts`
- `lib/x/preview-thread.ts`、`lib/x/impression-tweet.ts`（削除）
- `supabase/migrations/<timestamp>_create_x_post_tasks.sql`（新規）
- `lib/x/post-reminders.ts`（新規）
- `app/api/cron/x-post-reminders/route.ts`（新規）
- `app/api/discord/interactions/route.ts`
- `lib/env.ts`
- `.github/workflows/cron-send-content-notifications.yml`
- `lib/db/types.ts` など、DB の型の定義がある場所（`x_post_tasks` を足す。既存のテーブルの足し方に合わせる）
- テスト: `tests/api/notify-discord.test.ts`、`tests/lib/x/preview-thread.test.ts` と `tests/lib/x/impression-tweet.test.ts`（削除）、新しいテスト

## 守ること

- Discord のメッセージ作成（Create Message）と Button・Action Row の書き方は、**Discord 公式ドキュメントの JSON params とフィールドの表を引いて決める。** 例のコードから推測しない。参照した表の項目名を PR 本文に書く。
- 今の Webhook（`DISCORD_WEBHOOK_JA` など）でボタンを送らない（アプリが所有しない Webhook は操作できるコンポーネントを送れない。仕様書の API サーフェス 4）。
- ボタンの処理は、今の署名確認と Owner の確認の後に置く。
- `prematchReminderDueAt` の深夜の判定には、`lib/push/notifications.ts` の `previewNotificationSlot` をそのまま使う（同じ計算を書き直さない）。
- `notify-discord` の LLM を使わない部分（`buildTweetText` の文面、試合 URL、公式アカウントへの返信文）は変えない。
- 催促のメッセージに投稿の下書きを付けない。

## 処理すべきエッジケース

1. 同じ回に、初回の催促と再度の催促の両方の条件を満たす行は無い（`reminded_at` が無い行だけが初回の対象）。初回を送った行を、同じ回に再度の対象にしない。
2. ボタンを 2 回押した、または「投稿した」の後に「見送る」を押した → 最初の結果のまま（`status = 'pending'` のときだけ更新）。
3. 試合の延期でキックオフが変わった → `prematch` の `due_at` は作った時点の値のまま。`missed` の判定は、DB の最新の `kickoff_at` で行う。
4. `DISCORD_OWNER_USER_ID` が無い → 催促を送らない（メンションできないため）。route は 200。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 受け入れ条件 0 の `grep` は、標準エラーを捨てずに実行し、出力をそのまま PR 本文に貼る。
- 「壊して落ちる」確認（コミットしない）: 仕様書の受け入れ条件 11 の 3 つ。内容と結果を PR 本文に書く。

## やってはいけないこと

- マイグレーションを本番に適用すること（Owner が行う）。
- 本番の Discord に送信すること（テストはすべてモック）。
- Discord のコマンドの再登録。

## 完了時

- PR 本文に書くこと:
  - 変更・削除したファイルの一覧
  - 受け入れ条件 0〜13 のそれぞれについて、確認の方法と結果（12 は「マージ前に Owner が適用」と書く）
  - 参照した Discord 公式ドキュメントの表と項目名
  - 「壊して落ちた」確認の内容
  - Owner がマージ前にすること（仕様書の「Owner がすること」をそのまま転記）
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。

## 追記（2026-09-27）: PR #899 の修正

仕様書の末尾「追記（2026-09-27）: PR #899 のレビューで見つかった 2 点」を、**PR #899 のブランチ（`codex/feat-x-post-reminders`）に追加のコミットで**実装する（新しい PR は作らない）。

- 直すのは `app/api/cron/x-post-reminders/route.ts` とそのテストだけ。
- 追加した受け入れ条件のテストを足す。既存のテストは消さない。
- 「壊して落ちる」確認: 2 の 72 時間の判定を外すと、追加したテストが落ちること。内容と結果を PR にコメントで書く。
- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行し、結果を完了報告に含める。
