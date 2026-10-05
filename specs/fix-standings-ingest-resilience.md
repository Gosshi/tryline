# 順位表の取り込みが 1 試合の記録待ちで止まらないようにする

## 背景

トップ14の順位表が 2026-09-22 から更新されず、大会ページ・試合ページ・アプリの順位表に古い値が出ていた（2026-10-05 に Owner 承認の手動実行で復旧）。

Claude Code の調査（2026-10-05、Vercel の実行ログ）:
- 毎週月曜の `cron-ingest-standings`（`POST /api/cron/ingest-standings`）が **2026-09-28 と 10-05 の 2 回続けて 500** で失敗した。
- 原因はどちらも `scripts/calculate-standings.ts` の `ensureMatchEventsAvailable` が投げた `finished_match_events_missing: <match_id>`。トップ14の順位表の計算は、**終了した試合が 1 つでも `match_events` を持っていないと全体をエラーにする**。
  - 10-05 の例: モンペリエ 28–0 トゥーロン（キックオフ 10-05 04:05 JST）。順位表の取り込みは 19:41 JST、この試合の最初の `match_events` は 20:54 JST（トップ14の得点の取り込み `ingest-top14-match-events` が後から入れた）。
  - トップ14は日本時間の月曜早朝まで試合があり、得点の記録は後から入るので、**月曜の取り込みでは毎週同じことが起きうる**。
- ルート（`app/api/cron/ingest-standings/route.ts`）は、トップ14が失敗すると、Wikipedia から取り込む他の大会が成功していても 500 を返す。GitHub Actions のログには「500」しか残らず、**2 週続けて誰も気づかなかった**。
- 別の問題: `autumn-nations` の最新の大会 `autumn-nations-2026`（試合 0 件、`season_status` は unknown）の取り込み元 `https://en.wikipedia.org/wiki/2026_end-of-year_rugby_union_internationals` が 404 で、毎週 `failed` になっている（2026 年はネーションズチャンピオンシップに置き換わっている）。
- 確認済みで問題ではないもの: 応答の `no_rows_parsed`（リーグワン 2025-26・PNC 2026・ザ・ラグビーチャンピオンシップ 2026）は順位表の無い大会で正常。プレミアシップ・URC が古く見えたのは Wikipedia の更新待ちと週 1 回の取り込みの組み合わせで、不具合ではない。

## スコープ

対象:
1. トップ14の順位表の計算で、得点の記録が無い試合があっても全体を止めない。
2. トップ14の得点の取り込みが終わったら、トップ14の順位表を計算し直す（月曜を待たない）。
3. 取り込みに失敗・保留があったら Discord に通知する。
4. 試合が 0 件の大会では Wikipedia を取りに行かない。

対象外: Wikipedia から取り込む大会の読み取り処理（`lib/scrapers/wikipedia-standings.ts`）、取り込みの頻度（週 1 回のまま）、プレミアシップ・URC。

## データモデル変更

なし。

## API サーフェス

`POST /api/cron/ingest-standings` の応答の形は今のまま（`result.top14` と `result.weekly`）。変えるのは HTTP ステータスの決め方だけ（下の 1-c）。

## UI サーフェス

なし。

## 変更内容

### 1. トップ14の計算を止めない（`scripts/calculate-standings.ts`）

- a. `ensureMatchEventsAvailable` で投げる代わりに、得点の記録が無い終了済みの試合を `pendingMatchIds` として返す。
- b. `calculateStandings` は、`pendingMatchIds` が 1 件以上なら**順位表を書き込まずに** `{ status: "skipped", reason: "events_pending", pendingMatchIds }` を返す。理由: トライ数が分からないとトライのボーナス点が決まらず、誤った勝点を書くことになる。前回の正しい順位表を残す方がよい。
- c. ルートは、トップ14が `skipped` のときは 200 を返す（失敗ではない）。トップ14の計算が例外を投げたときは、今どおり 500 を返す（GitHub Actions を赤くする）。Wikipedia の大会の `failed` は、今どおり 200 のまま（`ingestWeeklyStandings` は大会ごとに例外を捕まえて結果に入れるため、今も 500 にはならない。2026-10-05 の手動実行で確認）。代わりに 3 の Discord 通知で知らせる。

### 2. 得点の取り込みの後に計算し直す（`app/api/cron/ingest-top14-match-events/route.ts`）

- 得点の取り込みが終わった後（取り込みの成否に関係なく、例外で終わった場合を除く）、`calculateLatestTop14Standings()` を呼ぶ。結果（`updated` / `skipped` と理由）を応答の `standings` に入れる。
- 計算が例外を投げても、得点の取り込みの応答は失敗にしない（`standings: { status: "failed", error }` とし、Discord に通知する）。

### 3. Discord に通知する（`lib/llm/notify.ts` に関数を足す）

- 通知する: Wikipedia の大会の `failed`、トップ14の計算の例外、**トップ14の `events_pending` が、保留中の試合のうち一番古いキックオフから 48 時間を超えている**とき。
- 通知しない: `no_rows_parsed`（順位表の無い大会）、キックオフから 48 時間以内の `events_pending`（得点の記録の取り込み待ちで普通に起きる）。
- 文面: 大会・理由・試合 ID（保留のとき）。既存の通知関数の書き方に合わせる。

### 4. 試合 0 件の大会は取りに行かない（`lib/ingestion/weekly-standings.ts`）

- `ingestStandingsForFamily` で、最新の大会の試合数が 0 件なら、Wikipedia を取りに行かずに `{ status: "skipped", reason: "no_matches" }` を返す。`autumn-nations-2026` はこれで `failed` ではなくなる。
- 試合数の数え方: `matches` の `competition_id` で件数を数える（`head: true` の count）。

## LLM 連携

なし。

## 受け入れ条件

1. `calculateStandings` のテスト: 終了した試合が 3 件、そのうち 1 件に `match_events` が無い入力で、例外を投げずに `{ status: "skipped", reason: "events_pending", pendingMatchIds: [その 1 件] }` を返し、`competition_standings` への upsert を呼ばない。
2. 同じ入力で全試合に記録があるときは、今どおり計算して upsert する（既存のテストが通る）。
3. ルートのテスト: トップ14が `skipped` のとき 200。トップ14が例外のとき 500。Wikipedia の大会に `failed` が 1 つあるとき 200 で、Discord の通知が 1 回呼ばれる。
4. 得点の取り込みのルートのテスト: 取り込み後に `calculateLatestTop14Standings` が 1 回呼ばれ、応答に `standings` が入る。計算が例外を投げても応答は成功で、Discord の通知が 1 回呼ばれる。
5. 通知のテスト: `events_pending` で一番古いキックオフが 47 時間前なら通知しない、49 時間前なら通知する。`no_rows_parsed` は通知しない。`failed` は通知する。
6. `weekly-standings` のテスト: 試合 0 件の大会では Wikipedia の取得（`scrapeCompetitionStandings`）を呼ばず、`no_matches` で `skipped` を返す。
7. 「壊して落ちる」確認（コミットしない）: 1 の `pendingMatchIds` の判定を外す（記録の無い試合も計算に含める）と、1 のテストが落ちる。出力を PR 本文に貼る。
8. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。

## 実行範囲（本番操作）

この PR に本番の操作は無い。マージ後の最初の月曜（2026-10-12）の取り込みの結果を Claude Code が確認する。

## 未解決の質問

- なし（2026-10-05 Owner 承認）。
