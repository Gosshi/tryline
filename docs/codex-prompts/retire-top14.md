# Codex 指示書: Top 14 からの撤退

仕様書: `specs/retire-top14.md`（受け入れ条件は仕様書を正とする）。決定は `docs/decisions.md` D038。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（関数名・引数・戻り値の型が違う、表に挙げた関数が別の場所にある等）、実装を進めずにその場で止めて報告する。

**マージ順:** `specs/feat-league-one-2026-27-season.md` の PR と `lib/ingestion/live-competitions.ts` が競合する。リーグワン側に期限（2026-12-09）があるので、リーグワン側が先にマージされていたら、こちらを最新の main に合わせてから PR を出す。

## やること
- `lib/competitions/retired.ts` を作る（`RETIRED_COMPETITION_FAMILIES = ["top-14"]`、`isRetiredCompetitionFamily`）。以下はすべてこの関数で判定し、`"top-14"` の文字列比較を各所に書かない。
- 取り込みを止める: `LIVE_COMPETITION_SOURCES` から Top 14 を外す／`ingest-standings` から `calculateLatestTop14Standings` を外す／`cron-ingest-top14-match-events.yml` の `schedule` を消す（`workflow_dispatch` は残す）。
- 記事生成を止める（2か所）:
  - `lib/cron/orchestrate.ts` の `getMatchIdsMissingContent` で、`matches` を取った直後（`match_content` を引く前）に撤退済みを除き、件数を `retiredSkippedCount` として返してログに出す。
  - `lib/llm/pipeline.ts` の `generateMatchContent` の最初で family を1回引き、撤退済みなら LLM・`assembleMatchContentInput`・`logPipelineRun`・書き込みを一切せずに `skipReason: "competition_retired"` で返す。`PipelineResult` の型に足す。
- 通知を止める: `send-prematch-notifications` と `x-post-reminders` の対象選択から撤退済みを除く。
- 表示から外す: 仕様書5節の表のとおり（ナビ・フッター・`getMatchesInRange`・`getUpcomingMatches`・`getNextUpcomingMatch`・`getRecentlyReviewedFamilies`・`getRecentlyReviewedCompetitionGroups`・`listCompetitionScheduleCoverage`・`getFeaturedCompetition`・`app/page.tsx` の大会リンク）。**上限（limit）より前に除く。**
- `/c/top-14` と `/c/top-14/[season]` の見出し直下に、更新終了の一文（仕様書6節の文言そのまま）を出す。既存のトークンだけを使う。
- 受け入れ条件1〜13のテストを書く・書き換える。

## 守ること
- **`listFamilies()` は変えない**（静的パラメータ・サイトマップ・iOS アプリの `/api/v1/competitions` が使う）。
- 既存データを消さない・変えない。マイグレーションは作らない。本番 DB には触らない。
- Top 14 のスクレイパー・`app/api/cron/ingest-top14-match-events/route.ts`・関連テストと fixture は消さない（呼び出し元を外すだけ）。
- URC・プレミアシップ・リーグワンの挙動を変えない。既存テストのうち他の大会の期待値を弱めない・消さない。Top 14 を前提にした fixture は「出ないこと」の検証に書き換えるか、他の大会に置き換える。
- `lib/x/post-reminders.ts` の `CLUB_COMPETITION_FAMILIES` と `lib/x/post.ts` のハッシュタグは変えない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 受け入れ条件4（ワークフローの diff）
  - 受け入れ条件9（limit より前に除いた方法。DB 側の絞り込みか、多めに取って JS で除いたか）
  - 受け入れ条件12（`isRetiredCompetitionFamily` を常に `false` にしたときに落ちたテストの出力。変更は戻す）
- マージ前に `gh pr checks` が緑であること。
- マージ後の本番確認（仕様書「マージ後の確認」）は Claude が行う。
- PR を出したら、マージを待つ。
