# Codex 指示書: 日程の取り込み（RWC 2027）を、壊さずに取り込み直せるようにする

仕様書: `specs/fix-fixture-ingest-safe-reingest.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。**

## やること
- 着手前に `RWC_2027_POOL_PAGE_URLS` の 6 ページを今の状態で取得して `tests/fixtures/` に保存し、今の `parseWikipediaRwc2027Html` で各試合に付く日付を出して PR 本文に貼る（ずれの確認）。
- RWC 2027 の日付と時刻の読み取りを、保存した実際のページで正しく動くように直す。36 試合が仕様書の「正しい日程」と一致すること。
- RWC 2027 の書き込みで、既存の行を `(competition_id, home_team_id, away_team_id)` で探す。同じ組み合わせが 2 行以上なら書き込まずにエラー。`wikipedia_event_id` は上書きしない。他の大会の照合は変えない。
- `POST /api/cron/ingest-fixtures` に `dryRun` を足し、書き込まずに予定する操作の一覧を返す。`cron-ingest-fixtures.yml` に `workflow_dispatch` の入力 `dry_run` を足す。
- RWC 2027 の書き込み前の安全装置（試合数が 36 でない・insert がある・組み合わせの重複）で、何も書き込まずに失敗する。
- 仕様書の「5. テスト」を足す。

## 守ること
- シックスネーションズ 2027 の読み取り・照合の結果を変えない（既存のテストが通ること）。
- 本番のデータには触らない。ワークフローの有効・無効も変えない（今は無効。再開は Claude Code がマージ後に行う）。
- 新しい依存パッケージを足さない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 受け入れ条件 2（壊して落ちる）と 3（直す前と後の読み取りの結果）を PR 本文に貼る。PR を出したらマージを待つ。
