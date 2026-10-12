# Codex 指示書: 調査する試合のプレビューは、事実が入るまで作らない

仕様書: `specs/fix-preview-hold-for-research.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。

**着手の前提:** `specs/feat-ops-bulk-fact-paste.md` の PR がマージ済みであること（`lib/sourced-facts/manual-entry.ts` の `decideManualFactRegeneration` がある）。無ければ着手せずに止める。

## やること
- `lib/cron/preview-research-hold.ts` を作る（`isInPreviewResearchScope`・`previewResearchDeadline`・`isPreviewHeldForResearch`。JST の扱いは `lib/cron/preview-window.ts` と同じやり方）。
- `lib/cron/orchestrate.ts` のプレビュー候補から、待つ条件に当たる試合を外す。手動の事実の有無は、候補の ID の一覧で `match_sourced_facts` を1回だけ引く。外した件数をログに出す。
- `decideManualFactRegeneration` に `"generate"`（既存なし・D030 の時刻を過ぎている・`scheduled`・キックオフが未来）を足す。Discord と `/ops/facts` の結果の文言を、`"generate"` のときは「作りました」にする。
- 受け入れ条件1〜4のテストを書く。
- **ついでの修正（#935 の積み残し）:** `app/ops/facts/page.tsx` の `metadata.title` を `"Tryline"` にする。今は持ち主でない人が開いて 404 になっても、タブ名に「調査事実の一括入力」が出る（2026-10-12 本番で確認）。`robots` の noindex は残す。テストを1つ足す（`metadata.title` が `"Tryline"`）。
- **ついでの修正（2）:** `scripts/vercel-ignore-build.sh` で、`VERCEL_GIT_PREVIOUS_SHA` が今のコミット（`git rev-parse HEAD`）と同じときは `exit 1`（ビルドする）にする。今は Vercel の「Redeploy」で同じコミットを作り直すと「docs だけの変更」と判定されて必ず取り消され、環境変数を足しても反映できない（2026-10-12 本番で `OPS_OWNER_USER_IDS` が反映できなかった）。他の判定は変えない。PR 本文に、同じコミットを渡したときに `build:` と出て `exit 1` になる実行例を貼る。

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
