# 時刻が決まっていない試合を「時刻未定」と表示する

## 背景

2026-10-06、GPT のサイト評価で「プレミアシップの先の試合に 09:00 や 08:00 が大量に並んでいて、確定した時刻か仮の値か分からない」と指摘された。Claude Code が本番の DB で確認した（未来の試合、UTC の時刻で集計）。

| 大会 | 仮の時刻 | 件数 | 期間 |
|---|---|---|---|
| `urc-2026-27` | 00:00 UTC（日本時間 09:00） | **128** | **2026-10-09**〜2027-05-15 |
| `premiership-2026-27` | 00:00 UTC（英国の冬時間の 0 時、日本時間 09:00） | 15 | 2027-01-22〜03-26 |
| `premiership-2026-27` | 23:00 UTC（英国の夏時間の 0 時、日本時間 08:00） | 29 | 2027-04-15〜06-03 |

- 取り込み元の Wikipedia に**日付だけが載っていて時刻が無い**試合を、取り込みが「現地の 0 時」として保存している（URC: `lib/ingestion/sources/wikipedia-urc.ts`、プレミアシップ: `lib/scrapers/premiership-kickoff.ts` の `timeText = "00:00"`）。Wikipedia に時刻が載れば次の取り込みで正しい値になる（`project_urc_kickoff_time_placeholder`。Tryline の不具合ではなく、元の情報が未確定）。
- 問題は表示: 画面・カレンダー・iCal・アプリが、仮の 0 時を**確定した時刻のように**「09:00」と表示している。URC は今週末（10/9〜）の試合も含まれる。試合の開始時刻を間違えると、観戦の予定を直接狂わせる。
- 仮の時刻を「00:00 UTC なら未定」と表示側で推測することはできない。00:00 UTC（日本時間 9:00）に本当に始まる試合がある（スーパーラグビーの NZ の正午など）。**取り込みの時点で「時刻が無かった」ことを記録する**。

## スコープ

対象:
1. 試合に「時刻未定」を記録する列を足す。
2. 日付だけの試合を作る取り込みで、その列を立てる。時刻が載ったら下ろす。
3. 画面・iCal・アプリ向け API で、時刻未定の試合は時刻を出さない。

**着手順**: `specs/fix-rwc2027-kickoff-timezones.md` と同じファイル（`wikipedia-six-nations.ts`）を触る。RWC の修正を先にマージし、その後の `origin/main` から切る。

対象外: アプリ側の表示（API に項目を足すところまで。アプリは別の spec）、プレビュー生成の日付の判定（下の「既知の影響」）、Wikipedia 以外の取り込み元の時刻の正確さの見直し。

## データモデル変更

- `matches` に `kickoff_time_tbd boolean not null default false` を足すマイグレーション（`supabase/migrations/`）。
- 既存の行は `false` のまま（マイグレーションで推測して埋めない）。URC・プレミアシップは 6 時間ごとの取り込み（`cron-live-pipeline`）が全試合を読み直すので、デプロイ後の最初の取り込みで正しい値になる。
- **マイグレーションはマージ前に Owner が本番に適用する**（`feedback_migration_before_merge`。新しい列を読むコードが先に出ると、列が無くてページが落ちる）。

## 変更内容

### 1. 取り込みで記録する

- 日付だけで時刻が無い試合を作る読み取り処理に、`kickoffTimeTbd: boolean` を返させる。2026-10-06 時点で Claude Code が見つけた場所:
  - `lib/ingestion/sources/wikipedia-urc.ts`（HTML の読み取り `parseKickoffText` の時刻なし、wikitext の読み取り `parseUrcWikitextKickoffAt` の `timeText` が空）
  - `lib/scrapers/premiership-kickoff.ts`（`timeText = "00:00"` の既定値）
  - `lib/ingestion/sources/wikipedia-six-nations.ts`（`parseKickoffAt` の日付だけの分岐。シックスネーションズ・ネーションズチャンピオンシップ・RWC で使われる）
- 着手前に、ほかにも日付だけで時刻を補っている取り込みが無いか探し（`rg -n '"00:00"|timeText: null|T00:00:00' lib/ingestion lib/scrapers`）、見つけたものを PR 本文に一覧で書き、同じく対応する。
- `lib/ingestion/upsert.ts` の挿入・更新で `kickoff_time_tbd` を書く。**更新のときも必ず上書きする**（時刻が載ったら `true` → `false`）。
- 時刻が載って `kickoff_at` が変わったとき、同じ試合が二重に作られないこと。プレミアシップの wikitext の読み取りは、Wikipedia 側に試合の `id` が無いとき、識別子に `kickoffAt` を含める（`${homeTeamSlug}_${awayTeamSlug}_${kickoffAt}`、`wikipedia-premiership.ts`）。この場合、時刻が載ると識別子が変わって新しい行が作られうる。**時刻未定の試合では識別子に時刻を含めない**（日付だけにする）など、二重登録が起きない形にし、テストで固定する。

### 2. 表示で時刻を出さない

- 時刻を表示している共通の関数（`lib/format/kickoff.ts` など）に「時刻未定」の扱いを足し、時刻未定の試合は日付と「時刻未定」だけを出す（例: `10月9日（金）時刻未定`）。並び順は今の `kickoff_at` のままでよい。
- 影響する画面: トップ、今週の日程（カレンダー）、大会のページの日程、試合のページの上部、チームのページ、対戦成績のページの次回対戦。時刻を表示している箇所を `rg` で洗い出し、PR 本文に一覧で書く。
- 試合の構造化データ（JSON-LD の `startDate`）は、時刻未定のとき日付だけ（`2026-10-09`）にする。
- **iCal**（`app/api/calendar/[feed]/route.ts`）: 時刻未定の試合は終日の予定（`DTSTART;VALUE=DATE:`）にし、件名の後ろに「（時刻未定）」を付ける。時刻が決まったら、次にカレンダーが読み直したときに時刻付きに変わる（`UID` は今のまま）。

### 3. アプリ向け API

- `lib/api/v1/types.ts` の、`kickoff_utc` を持つ型（`V1CalendarMatch`・`V1NextReadMatch`・試合詳細など）に `kickoff_time_tbd: boolean` を足し、各ルートで値を入れる。項目を足すだけで、既存の項目は変えない（今のアプリは知らない項目を無視する）。

## 既知の影響（この spec では直さない）

- プレビューは「日本時間でキックオフの前日 15 時」に作る（D030）。時刻未定の URC の金曜夜の試合（実際は日本時間の土曜未明）は、仮の時刻では金曜扱いになり、1 日早く作られる。記事の中身に時刻は使っていないので、早く作られるだけで誤りにはならない。必要なら別の spec にする。

## API サーフェス

上の 3。

## UI サーフェス

上の 2。

## LLM 連携

なし。

## 受け入れ条件

1. 読み取りのテスト:
   - URC: 時刻の無い試合は `kickoffTimeTbd: true`、時刻のある試合は `false`。
   - プレミアシップ: `24 January 2027` だけなら `true`、`24 January 2027 15:00` なら `false`。
   - 共通の読み取り処理: 日付だけなら `true`。
2. 更新のテスト: 既存の行が `kickoff_time_tbd = true` で、時刻付きの候補が来たら、同じ行が更新されて `false` になり、`kickoff_at` が新しい時刻になる。新しい行は増えない（プレミアシップの、Wikipedia に `id` が無い場合を含む）。
3. 表示のテスト: 時刻未定の試合で、時刻の文字列（`09:00` など）が出ず「時刻未定」が出る。時刻のある試合は今の表示のまま（既存のテストが通る）。
4. iCal のテスト: 時刻未定の試合は `DTSTART;VALUE=DATE:20261009` で、件名に「（時刻未定）」が付く。時刻のある試合は今のまま。
5. API のテスト: カレンダーと試合詳細の応答に `kickoff_time_tbd` が入る。
6. 「壊して落ちる」確認（コミットしない）: 表示の関数で `kickoff_time_tbd` を無視すると 3 のテストが落ちる。更新で `kickoff_time_tbd` を書かないようにすると 2 のテストが落ちる。出力を PR 本文に貼る。
7. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。
8. PR 本文に、プレビューで URC の大会のページ（今週の節）と試合のページのスクリーンショットを貼る（時刻未定の試合が「時刻未定」になっていること）。

## 実行範囲（本番操作）

1. マージ前: Owner がマイグレーションを本番に適用する。Claude Code は列ができたことを確認する（`select column_name from information_schema.columns where table_name = 'matches' and column_name = 'kickoff_time_tbd'`）。
2. マージ・デプロイ後: 次の `cron-live-pipeline` の後に、Claude Code が `urc-2026-27` と `premiership-2026-27` の未来の試合で `kickoff_time_tbd = true` の件数を数え、上の表の件数（128・44）と大きく違わないこと、`true` の行の時刻がすべて仮の値（現地 0 時）であることを確かめる。

## 未解決の質問

- なし。
