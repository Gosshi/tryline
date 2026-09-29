# Codex 指示書: クラブ大会の得点イベントを、試合後 7 日まで毎回取り直す

仕様書: `specs/fix-club-event-retry-window.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `lib/ingestion/live-ingest.ts` の `ingestLiveCompetition` に、2 つ目の引数 `now: Date = new Date()` を足す（既存の呼び出し元は変えない）。
2. `finishedRecordIds` について `matches` から `id, kickoff_at` を引き、`kickoffAtById` を作る。
3. `eventMatches` の絞り込みに、「キックオフが `now` の 7 日前から `now` まで」の条件を、今の 2 つの条件（`statusChangedToFinished`・`fetchEventMatches`）と「または」で足す。

## 触るファイル

- `lib/ingestion/live-ingest.ts`
- テスト（`tests/ingestion/` の既存の `ingestLiveCompetition` のテストの形に合わせる。例: `tests/ingestion/six-nations-live.test.ts`）

## 守ること

- キックオフは DB の `kickoff_at` を使う（`resolvedMatches` の `kickoffAt` は `null` になる大会がある）。
- 得点イベントの合計とスコアの照合、`dropReconciledPhantomEvents`、`upsertMatchEvents` の呼び方は変えない。
- NC・リポビタン D（`fetchEventMatches` がある大会）の動きは変えない。
- 仕様書の「別件の気づき」（`candidateIndex` の添え字のずれ）は直さない。
- 既存のテストは消さない。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 仕様書の受け入れ条件 5 の 2 つ。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番 DB に書き込むこと、Wikipedia に実際に取得しに行くこと（テストはモック・fixture）。

## 完了時

- PR 本文に、変更したファイルの一覧、受け入れ条件 1〜6 の確認の方法と結果、「壊して落ちた」確認の内容を書く。
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。

## 追記（2026-09-29）: PR #902 の修正

仕様書の末尾「追記（2026-09-29）: PR #902 のレビューで見つかった上限の問題」を、**PR #902 のブランチに追加のコミットで**実装する（新しい PR は作らない）。

- 直すのは `lib/ingestion/live-ingest.ts` とそのテストだけ。
- 追加の受け入れ条件 7・8 のテストを足す。既存のテストは消さない。
- 「壊して落ちる」確認: 追加の受け入れ条件 9。内容と結果を PR にコメントで書く。
- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行し、結果を完了報告に含める。
