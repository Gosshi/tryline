# Discord のレビュー通知から「公式へのリプライ案」を外す

## 背景
レビュー（recap）を Discord に通知するとき、④「公式へのリプライ案 🇯🇵」と⑤「公式へのリプライ案 🇬🇧」の 2 欄が付く（`app/api/cron/notify-discord/route.ts` の `appendOfficialReplyFields`）。Owner は使っておらず、読むたびに無駄になる（2026-11-21 Owner「止めたい」）。

この 2 欄は定型文で作っており、LLM は呼んでいない。そのため外しても OpenAI の費用は変わらない。減るのは通知の長さと、そのための `match_events` クエリ 1 本（recap 1 件ごと）。

## スコープ
対象:
- `app/api/cron/notify-discord/route.ts` で ④⑤ の 2 欄を作らない
- 2 欄のためだけにある処理と型を消す: `appendOfficialReplyFields`、recap のときの `match_events`（type=try）クエリと `tryScorers` の組み立て、`getPlayerNameFromMetadata`、`MatchEventRow`、`buildOfficialReplyText` / `TryScorer` の import。他で使っていれば残す（着手前に `rg` で確認する）
- `lib/x/reply-text.ts` と `tests/lib/x/reply-text.test.ts` を消す（現在の利用者は上の route だけ。着手前に `rg "reply-text"` で再確認する）

対象外:
- ①〜③の欄（本文・②「リプライ案（URLなし）」等）、画像、送信先 webhook、`discord_notified_at` の更新
- プレビュー通知（④⑤はもともと recap のときだけ付く）
- `lib/x/post.ts`、`.claude/skills/x-reply`

## データモデル変更
なし

## API サーフェス
なし（cron の応答の形は変えない）

## UI サーフェス
Discord の recap 通知の embed: fields は ①〜③ の 3 欄だけになる。preview 通知は変わらない。

## LLM 連携
なし

## 受け入れ条件
1. recap の通知の `embeds[0].fields` の name に「④ 公式へのリプライ案 🇯🇵」「⑤ 公式へのリプライ案 🇬🇧」が含まれない。①〜③の name と順番は今と同じ
2. recap の通知の処理で `match_events` を読まない（テストの db モックで `match_events` への `from` 呼び出しが 0 回）
3. preview の通知の payload は変更前と同じ（既存テストの期待値を変えずに通る）
4. `rg "buildOfficialReplyText|reply-text|公式へのリプライ案" app lib tests` が 0 件
5. テストの変更は次だけにする。どれも PR 本文に理由を書く:
   - `tests/api/notify-discord.test.ts` の ④⑤ の中身を確かめるテスト（`fields[3]` / `fields[4]` を見るもの）を、「④⑤ が無く、fields が 3 欄」を確かめるテストに置き換える
   - 同ファイルの `keeps official reply draft fields within the Discord value limit` を消す
   - `tests/lib/x/reply-text.test.ts` を消す
   - 使われなくなった `eventsByMatch` 等のモックを消す
   上記以外の既存テストの期待値は変えない・弱めない
6. 1 を壊す確認: route で 2 欄を足し直すと、5 の置き換えたテストが落ちる（出力を PR 本文に貼り、変更は戻す）
7. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る

## 未解決の質問
なし
