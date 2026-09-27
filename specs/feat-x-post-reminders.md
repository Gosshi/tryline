# 代表戦の X 投稿を忘れないための催促（Discord・完了ボタン付き）

## 背景

- 2026-09-27 のオーストラリア 対 南アフリカ（18:30 JST、42–38）で、試合前の X 投稿を忘れた。Owner いわく「割と痛手」。
- **通知が無かったわけではない。** このプレビューは X の下書き付きで 9/27 1:51 に Discord に届いていた（`app/api/cron/notify-discord/route.ts`、`match_content.discord_notified_at`）。失敗の原因は次の 3 つ（2026-09-27 に DB とワークフローで確認）:
  1. **量が多い:** 大会を区別せず、公開された全記事を同じ形で送る。9/27 は 20:43〜20:45 に Top 14 などの記事 7 本が並んだ。代表戦が埋もれる。
  2. **時刻が合っていない:** 送信は `cron-post-to-x.yml` の 1 日 3 回（03:00・13:00 UTC、土日 16:00 UTC）で、実際は遅れる。今回は深夜 1:51 に届き、試合前の時間帯には流れていた。
  3. **完了の確認が無い:** 投稿したかを誰も追っていないので、忘れても気づく機会がない。
- X への投稿は Owner が手で行う（自動投稿は停止済み。`.claude/skills/x-post/SKILL.md`）。

**方針（Owner 決定 2026-09-27）:**
- 対象は**代表戦だけ**。
- **催促は「投稿した」「今回は見送る」のボタンで止める。** どちらも押されなければ 1 回だけ再度催促する。
- **今の Discord 通知に付いている、LLM で作る X の投稿例（プレビューのスレッド案・レビューの読みどころ案）はやめる。** 使われておらず、トークンの無駄になっている。投稿文は Owner が書く（必要なら Claude Code の `x-post` スキルで作る）。

## スコープ

**対象**
0. `notify-discord` から、LLM で X の投稿例を作る処理を外す（下の API サーフェス 0）。
1. 代表戦の各試合について、「試合前の投稿」「試合後の投稿」の 2 つのタスクを DB に記録する。
2. それぞれ、投稿すべき時刻に Discord で Owner をメンションして催促する。
3. 催促のメッセージに「投稿した」「今回は見送る」のボタンを付け、押された結果を記録する。
4. 押されなければ 1 回だけ再度催促する。試合前のタスクは、キックオフまでに押されなければ「逃した」として記録する。

**対象外**
- 今の Discord 通知（`notify-discord`）の送り先・時刻、LLM を使わない部分の内容（そのまま残す）。
- クラブの大会（URC、プレミアシップ、Top 14、スーパーラグビー、リーグワン）。
- X への自動投稿。
- X の投稿を API で確認すること（押されたボタンだけを記録する）。
- 新しい LLM 呼び出し（催促のメッセージには LLM を使わない）。
- 催促のメッセージに投稿の下書きを付けること。

## データモデル変更

新しいテーブル `x_post_tasks`（マイグレーションは Codex が書き、**マージ前に Owner が本番に適用する**）。

```sql
create table public.x_post_tasks (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null check (kind in ('prematch', 'postmatch')),
  status text not null default 'pending'
    check (status in ('pending', 'posted', 'skipped', 'missed')),
  due_at timestamptz not null,
  reminded_at timestamptz,
  re_reminded_at timestamptz,
  discord_message_id text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (match_id, kind)
);

alter table public.x_post_tasks enable row level security;
-- ポリシーは作らない（サーバーの service role だけが読み書きする）
```

## API サーフェス

### 0. 今の Discord 通知から LLM の投稿例を外す（`app/api/cron/notify-discord/route.ts`）

- `generatePreviewThread`（`lib/x/preview-thread.ts`）を呼ぶ処理（日本語プレビューのときに `pushPreviewThreadFields` でスレッド案を足している部分）を削除する。
- `appendReadingHookTweetField`（中で `generateImpressionTweet`、`lib/x/impression-tweet.ts` を呼び「⑥ 読みどころ投稿案（URLなし）」を足している部分）を削除する。
- どちらも `MODELS.FAST` を 1 記事につき 1 回呼んでいる。使っているのはこの route だけ（2026-09-27 に `grep` で確認）。
- 呼ばれなくなった `lib/x/preview-thread.ts`、`lib/x/impression-tweet.ts` と、そのテスト（`tests/lib/x/preview-thread.test.ts`、`tests/lib/x/impression-tweet.test.ts`）は削除する。`tests/api/notify-discord.test.ts` のうち、この 2 つの投稿例を前提にした assert は「投稿例が無いこと」を確かめる形に書き換える（テストそのものは消さない）。
- LLM を使わない部分（`buildTweetText` などの文面、試合 URL、公式アカウントへの返信文）は変えない。

### 1. 代表戦の判定（新規 `lib/x/post-reminders.ts`）

```ts
export const CLUB_COMPETITION_FAMILIES = [
  "league-one",
  "premiership",
  "super-rugby-pacific",
  "top-14",
  "urc",
] as const;

export function isInternationalCompetitionFamily(family: string | null): boolean
```

- `family` が `null` なら `false`。`CLUB_COMPETITION_FAMILIES` に含まれれば `false`。それ以外は `true`。
- 「クラブ以外はすべて代表戦」とするのは、`australia-south-africa-test` のように単発の代表戦が新しい `family` で登録されるため（2026-09-27 時点で `competitions` に「代表戦かどうか」の列は無く、コードにもその分類は無い）。

### 2. 催促の時刻（同じファイル）

```ts
export function prematchReminderDueAt(kickoffAt: Date): Date
```

- 算出方法:
  1. `due = kickoffAt − 3 時間`
  2. `due` が日本時間で 0:00〜7:59 なら、`previewNotificationSlot(kickoffAt)`（`lib/push/notifications.ts`、#898）を返す
  3. それ以外は `due` を返す
- 例（日本時間）:

| キックオフ | 試合前の催促 |
|---|---|
| 日 18:30 | 日 15:30 |
| 日 01:30 | 土 22:30 |
| 日 10:30 | 土 22:30（3 時間前が 7:30 のため） |
| 日 11:00 | 日 08:00 |

- **試合後の催促の時刻（`kind = 'postmatch'`）:** その試合の日本語レビュー（`match_content`、`content_type = 'recap'`、`language = 'ja'`、`status = 'published'`）の `generated_at`。レビューが無いまま `kickoff_at + 6 時間` を過ぎたら、その時刻。

### 3. 定期処理（新規 `app/api/cron/x-post-reminders/route.ts`、GET、`assertCronAuthorized`）

1 回の実行で、次を順に行う。

1. **タスクを作る:** `kickoff_at` が今から 48 時間以内（過去 6 時間から未来 48 時間）で、代表戦の試合（`isInternationalCompetitionFamily(competition.family)`）について、`prematch` と `postmatch` の行を `upsert`（`onConflict: "match_id,kind"`、`ignoreDuplicates: true`）で作る。
   - `prematch` の `due_at` = `prematchReminderDueAt(kickoff)`
   - `postmatch` の `due_at` = `kickoff + 6 時間`（仮の値。レビューが公開されたら手順 2 で前倒しする）
   - 試合の状態が `scheduled` か `finished` 以外（中止など）の試合は作らない。
2. **試合後の時刻を前倒しする:** `status = 'pending'`・`reminded_at is null` の `postmatch` の行のうち、日本語レビューが公開済みの試合は、`due_at` をその `generated_at` にする。
3. **逃した試合前のタスクを閉じる:** `status = 'pending'` の `prematch` の行のうち、`now >= kickoff` のものは `status = 'missed'`、`resolved_at = now` にする。Discord のメッセージがあればボタンを外す（下の「メッセージの編集」）。
4. **初回の催促:** `status = 'pending'`・`reminded_at is null`・`due_at <= now` の行に催促を送り、`reminded_at` と `discord_message_id` を記録する。`prematch` は `now < kickoff` のときだけ送る。
5. **再度の催促:** `status = 'pending'`・`reminded_at` が 2 時間以上前・`re_reminded_at is null` の行に、もう一度送り、`re_reminded_at` を記録する。ただし:
   - 日本時間 0:00〜7:59 の間は送らない（次の回以降に回す）
   - `prematch` は `now < kickoff` のときだけ

- 1 回の実行で送る催促は最大 10 通。
- Discord への送信が失敗した行は、`reminded_at` を書かない（次の回に再送される）。1 件でも失敗したら、route は HTTP 500 を返す（#894 と同じ考え方で、GitHub Actions に失敗を表示する）。

### 4. Discord への送信（ボットのトークンで送る）

**今の Webhook（`DISCORD_WEBHOOK_JA` など）は使えない。** Discord の公式ドキュメント（Execute Webhook の `components`）に「アプリケーションが所有していない Webhook は、操作できるコンポーネントを送れない」とある。ボタンは押せる必要があるので、アプリのボットとしてチャンネルにメッセージを作る。

- 環境変数を 2 つ足す（`lib/env.ts`、どちらも optional。無ければ催促の送信をしない）:
  - `DISCORD_BOT_TOKEN`
  - `DISCORD_X_REMINDER_CHANNEL_ID`
- 送信: `POST https://discord.com/api/v10/channels/{DISCORD_X_REMINDER_CHANNEL_ID}/messages`、`Authorization: Bot {DISCORD_BOT_TOKEN}`。
  - **本文・`allowed_mentions`・`components` の書き方は、Discord 公式ドキュメントの Create Message の JSON params の表と、Message Components（Action Row・Button）の表を引いて決める。** 例のコードから推測しない。参照した表の項目名を PR 本文に書く。
- メッセージの内容:
  - 本文の先頭で Owner をメンションする（`<@DISCORD_OWNER_USER_ID>`）。`allowed_mentions` は Owner のユーザー ID だけを許す。
  - 1 行目: `X投稿（試合前）` または `X投稿（試合後）`、再度の催促なら先頭に `【再】`
  - 試合名（日本語表示名。`getTeamDisplayName`）、大会名、キックオフ（日本時間）
  - 試合ページの URL（`buildMatchShareUrl`）
  - 試合後の催促で日本語レビューがまだ無ければ「記事はまだありません」
  - **投稿の下書きは付けない**（Owner の決定。LLM も使わない）
- ボタン（Action Row 1 つ、ボタン 2 つ）:
  - 「投稿した」: `custom_id = "x_post:{task_id}:posted"`
  - 「今回は見送る」: `custom_id = "x_post:{task_id}:skipped"`

### 5. ボタンを押したとき（`app/api/discord/interactions/route.ts`）

- 今の署名確認と Owner の確認（`getInteractionUserId(interaction) !== DISCORD_OWNER_USER_ID`）の後に、`interaction.type === 3`（MESSAGE_COMPONENT）の分岐を足す。
- `data.custom_id` が `^x_post:([0-9a-f-]{36}):(posted|skipped)$` に合うとき:
  1. その行を `status = 'pending'` の場合だけ `posted` / `skipped` に更新し、`resolved_at = now` にする。すでに `pending` でなければ何もしない。
  2. 応答はコールバック型 7（UPDATE_MESSAGE）で、元のメッセージを「✅ 投稿済み（HH:mm）」または「⏭ 見送り（HH:mm）」（日本時間）に書き換え、`components` を空にしてボタンを外す。
- 合わない `custom_id` は、今の未対応の分岐と同じ扱い。

### 6. 定期実行

`.github/workflows/cron-send-content-notifications.yml`（30 分ごと）に、`/api/cron/x-post-reminders` を呼ぶステップを足す。今のステップが失敗しても実行されるよう `if: always()` を付ける。新しいワークフローは作らない（GitHub の定期実行は数が増えるほど遅れやすいため）。

## UI サーフェス

Discord の催促のメッセージとボタンだけ。サイトと iOS アプリは変えない。

## LLM 連携

新しい呼び出しは無い。今の Discord 通知から `MODELS.FAST` の呼び出しを 1 記事につき 1 回減らす（プレビューのスレッド案、レビューの読みどころ案）。

## 受け入れ条件

0. **LLM の投稿例を外す:** `notify-discord` の日本語プレビュー・日本語レビューの通知で、`generatePreviewThread` と `generateImpressionTweet` が呼ばれない（`grep -rn "generatePreviewThread\|generateImpressionTweet" app lib` が 0 件。**標準エラーを捨てずに実行し、その出力を PR 本文に貼る**）。送られる embed に「読みどころ投稿案」とスレッド案の項目が無い。
1. **代表戦の判定:** `isInternationalCompetitionFamily` が `urc`・`premiership`・`top-14`・`super-rugby-pacific`・`league-one`・`null` で `false`、`nations-championship`・`bledisloe-cup`・`australia-south-africa-test`・`autumn-nations` で `true`。
2. **催促の時刻:** `prematchReminderDueAt` が上の表の 4 例で期待どおり（テストは UTC の ISO 文字列。例: キックオフ `2026-09-27T09:30:00Z` → `2026-09-27T06:30:00Z`、キックオフ `2026-09-26T16:30:00Z` → `2026-09-26T13:30:00Z`）。
3. **タスクを作る:** 代表戦の試合 1 つとクラブの試合 1 つ（どちらも 24 時間後キックオフ）→ 代表戦の試合にだけ `prematch` と `postmatch` の 2 行ができる。もう 1 回実行しても行は増えない。
4. **初回の催促:** `due_at <= now < kickoff` の `prematch` の行 → Discord への送信が 1 回呼ばれ（モック）、本文に Owner のメンション、ボタン 2 つ、`allowed_mentions` に Owner のユーザー ID だけが入り、`reminded_at` と `discord_message_id` が記録される。`now < due_at` なら送らない。
5. **再度の催促:** `reminded_at` が 2 時間 1 分前の `pending` の行 → 送信され、本文が `【再】` で始まる。`now` が日本時間 3:00 なら送らない。`re_reminded_at` がある行には送らない。
6. **逃した:** `now >= kickoff` の `pending` の `prematch` の行 → `status = 'missed'` になり、送信されない。
7. **試合後:** 日本語レビューが公開された試合の `postmatch` の行は `due_at` がレビューの `generated_at` に前倒しされ、その回で送られる。レビューが無く `kickoff + 6 時間` を過ぎた行は、本文に「記事はまだありません」を含めて送られる。
8. **ボタン:** `custom_id = "x_post:<id>:posted"` の MESSAGE_COMPONENT（Owner）→ 行が `posted` になり、応答の `type` が 7 で `components` が空。Owner 以外のユーザー → 今の Owner 以外への応答と同じで、行は変わらない。すでに `skipped` の行 → 行は変わらない。
9. **失敗の表示:** Discord への送信が失敗するモック → その行の `reminded_at` は `null` のまま、route は HTTP 500。
10. **環境変数が無い:** `DISCORD_BOT_TOKEN` が無ければ送信を呼ばず、タスクの作成だけ行い、route は 200 を返す。
11. **壊して落ちる確認（コミットしない）:**
    - `isInternationalCompetitionFamily` を常に `true` にすると受け入れ条件 3 が落ちること
    - 再度の催促の日本時間 0:00〜7:59 の判定を外すと受け入れ条件 5 の 2 つ目が落ちること
    - `notify-discord` で `generatePreviewThread` の呼び出しを戻すと、受け入れ条件 0 のテスト（`tests/api/notify-discord.test.ts`）が落ちること
12. **RLS:** マイグレーションを適用した後、`select relrowsecurity from pg_class where relname = 'x_post_tasks'` が `true`。Owner が適用後に Claude Code が確認する。
13. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## Owner がすること（マージ前）

1. Discord の開発者ポータルで、今のアプリにボットを用意し（`/調査事実を追加` と同じアプリ）、`bot` スコープと「メッセージを送信」の権限でサーバーに追加する。
2. 催促用のチャンネルを決める（今の通知チャンネルとは別のチャンネルを推奨。埋もれないように）。
3. Vercel の本番の環境変数に `DISCORD_BOT_TOKEN` と `DISCORD_X_REMINDER_CHANNEL_ID` を入れる。
4. マイグレーションを本番に適用する。

## マージ後の確認（Claude Code が行う）

14. 次の代表戦（Nations Championship の週末）で、`x_post_tasks` に `prematch` と `postmatch` の行ができ、`reminded_at` が `due_at` の後に入っていること。
15. 1 週間後に、`posted`・`skipped`・`missed` の件数を Owner に報告する。

## 未解決の質問

なし。

## 追記（2026-09-27）: PR #899 のレビューで見つかった 2 点

1. **再度の催促で「記事はまだありません」が誤って出る。** `advancePostmatchDueTimes` は、レビューの有無（`recapExistsByMatch`）を `reminded_at is null` の行についてだけ調べている。レビューが無い時点（`kickoff + 6 時間`）で初回の催促を送り、その後にレビューが公開された場合、再度の催促にも「記事はまだありません」が出る。
   - 直し方: レビューの有無は、`status = 'pending'` の `postmatch` の行すべてについて調べる（`due_at` の前倒しは今どおり `reminded_at is null` の行だけ）。
   - 受け入れ条件 7 に追加: `reminded_at` が 2 時間 1 分前で、その後に日本語レビューが公開された `postmatch` の行 → 再度の催促の本文に「記事はまだありません」が無い。
2. **試合後のタスクが `pending` のまま残り続ける。** 試合前のタスクはキックオフで `missed` になるが、試合後のタスクには終わりが無い。ボタンが押されなければ永久に `pending` で、毎回の読み込み（`loadPendingTasks`）の件数が増え続ける。
   - 直し方: 「逃した試合前のタスクを閉じる」（API サーフェス 3 の手順 3）に、`status = 'pending'` の `postmatch` の行のうち `now >= kickoff + 72 時間` のものを `missed` にする処理を足す（ボタンの外し方は試合前と同じ）。
   - 受け入れ条件 6 に追加: `kickoff` から 72 時間 1 分たった `pending` の `postmatch` の行 → `missed` になり、送信されない。71 時間なら変わらない。
