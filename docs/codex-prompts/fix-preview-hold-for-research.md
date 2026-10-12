# Codex 指示書: 調査する試合のプレビューは、事実が入るまで作らない

仕様書: `specs/fix-preview-hold-for-research.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。

**着手の前提:** `specs/feat-ops-bulk-fact-paste.md` の PR がマージ済みであること（`lib/sourced-facts/manual-entry.ts` の `decideManualFactRegeneration` がある）。無ければ着手せずに止める。

## やること
- `lib/cron/preview-research-hold.ts` を作る（`isInPreviewResearchScope`・`previewResearchDeadline`・`isPreviewHeldForResearch`。JST の扱いは `lib/cron/preview-window.ts` と同じやり方）。
- `lib/cron/orchestrate.ts` のプレビュー候補から、待つ条件に当たる試合を外す。手動の事実の有無は、候補の ID の一覧で `match_sourced_facts` を1回だけ引く。外した件数をログに出す。
- `decideManualFactRegeneration` に `"generate"`（既存なし・D030 の時刻を過ぎている・`scheduled`・キックオフが未来）を足す。Discord と `/ops/facts` の結果の文言を、`"generate"` のときは「作りました」にする。
- 受け入れ条件1〜4のテストを書く。

## 守ること
- `previewDueUpperBound` と `previewCandidateUpperBound` の中身は変えない（他の cron も使っている）。
- レビュー・英語のプレビュー・通知の時刻は変えない。
- 既存のテスト（`tests/cron/preview-window.test.ts`・`tests/cron/content-windows.test.ts`・`tests/cron/orchestrate.test.ts`）のアサーションを弱めない。
- 本番 DB には触らない。テストでは時刻を `vi.setSystemTime` で固定する。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの: 受け入れ条件5（`isPreviewHeldForResearch` を常に `false` にしたときにテストが落ちた出力。変更は戻す）
- 受け入れ条件6（本番での確認）は、マージ後の最初の金曜に Claude が行う。
- PR を出したら、マージを待つ。
