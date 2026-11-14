# Codex 指示書: リーグワン 2026-27 を開幕に間に合わせる

仕様書: `specs/feat-league-one-2026-27-season.md`（受け入れ条件は仕様書を正とする）。決定は `docs/decisions.md` D038。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードやページの構造が食い違っていたら、実装を進めずにその場で止めて報告する。

**再開時の注意（2026-11-14）:** 前回の停止報告（日付も未定の7試合）を受けて仕様書の2節と受け入れ条件1・5・8・13を改訂した。ローカルに残っている実装途中のコード・fixture はそのまま使ってよい。fixture は取り直さない（受け入れ条件5の `101` はその fixture が前提）。

**期限: 2026-12-09（水）までにマージ。** 開幕は 12/12、開幕節のプレビューは 12/11 15:00 JST の cron で作られる。`specs/retire-top14.md` の PR と `lib/ingestion/live-competitions.ts` が競合するが、こちらを優先する。

## やること
- `lib/ingestion/sources/league-one-live.ts`:
  - `fetchLeagueOneSeason(season)` を足す（今の `fetchLeagueOne202526` の中身をシーズン引数にしたもの）。`fetchLeagueOne202526` はこれを呼ぶだけにする。プレーオフページが0件でもエラーにしない。
  - `parseKickoffAt` を、時刻が `HH:MM` でないとき（`Undecided` 等）は例外を投げず、その日付の 12:00 JST と `kickoffTimeTbd: true` を返すようにする。**日付が読めないカードは例外を投げずにその試合だけ除き、試合ID つきで `console.warn` を1回出す**（2026-11-14 改訂。仕様書2節）。`parseLeagueOneLiveHtml` で `kickoffTimeTbd` を `ParsedLiveMatch` に入れる。
  - チーム名が解決できなかったカードを、名前つきで `console.error` に出す（試合は今と同じく返さない。戻り値の型は変えない）。
- `lib/scrapers/league-one-schedule.ts` の `TEAM_SLUG_BY_LEAGUE_ONE_NAME` に `"Tochigi Honda Heat": "honda-heat"` と `"Toshiba Brave Lupus Musashi": "toshiba-brave-lupus"` を足す。既存の項目は消さない。
- `lib/ingestion/live-competitions.ts` の `league-one-2025-26` を、仕様書1節の `league-one-2026-27` の要素に置き換える。
- マイグレーション `supabase/migrations/<timestamp>_rename_league_one_teams_2026_27.sql` を作る（仕様書「データモデル変更」の表。`WHERE slug = ...` で `name`・`name_ja`・`english_name` を更新。`slug`・`short_code` は変えない）。
- fixture `tests/fixtures/league-one-schedule-2026-27.html` を、`https://league-one.jp/en/schedule/?t1=3&year=2026` から `fetchWithPolicy` 経由で**1回だけ**取得して保存する（仕様書「受け入れ条件」冒頭の4種のカードを含めること）。
- 受け入れ条件1〜13のテストを書く。

## 守ること
- 2025-26 以前の既存 fixture とテストの期待値を変えない。
- DIVISION 2・3 は取り込まない（今と同じ）。
- 英語版の生成・表示・サイトマップのコードは変えない（family で判定しているので、そのまま動く）。
- プレーオフの workflow（`cron-fill-league-one-playoff-events.yml`）は変えない（別 spec）。
- 本番 DB には触らない。マイグレーションは Owner が本番に適用する。**PR 本文の先頭に「マージ前にマイグレーションの本番適用が必要」と書く。**

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - fixture を `parseLeagueOneLiveHtml(html, "2026-27")` に通した結果の要約（返った試合数・`kickoffTimeTbd: true` の件数・解決できなかった名前の件数）
  - 受け入れ条件13（(a) 時刻未定の変更を戻した場合、(b) 対応表の2行を消した場合、(c) 日付が空のカードで例外を投げた場合に落ちたテストの出力。変更は戻す）
  - 4節で選んだ方法（別関数を export したか、パーサの中でログを出したか）
- マージ前に `gh pr checks` が緑であること。
- マージ後の本番確認（仕様書「マージ後の確認」）は Claude が行う。
- PR を出したら、マージを待つ。
