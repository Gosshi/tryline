# Codex 指示書: 汚染の片付けスクリプトと週次監査の読み込み漏れを直し、公開中のレビューを残す指定を足す

仕様書: `specs/fix-contamination-cleanup-pagination-keep-published.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

1. 片付けのスクリプト（`scripts/cleanup-contaminated-events.ts` の `loadFinishedMatchesWithEvents`）と週次監査（`lib/data-integrity/audit.ts` の `loadFinishedMatches`）が、完了済みの試合（1,088 件）を 1 回の問い合わせで読み、1,000 件で打ち切られている。`lib/db/pagination.ts` の `loadAllPages` と `id` の昇順で全件を読む。
2. 片付けのスクリプトに `--keep-published` を足す。指定したときは、イベントの削除だけを行い、レビューを下書きに戻さない。

## 触るファイル

- `scripts/cleanup-contaminated-events.ts`
- `lib/data-integrity/audit.ts`（`loadFinishedMatches` だけ）
- `tests/scripts/cleanup-contaminated-events.test.ts`、`tests/data-integrity/audit.test.ts`

## 守ること

- 判定の仕組み（`findStructuralContamination`、`findCleanupGroups`）は変えない。
- 持ち主の試合を削除しないこと、削除の前にバックアップを取ることは、今のまま守る。
- `--keep-published` を付けない場合の動き（削除した試合の公開済みレビューを下書きに戻す）は変えない。
- 週次監査の、完了済みの試合以外の読み込みは変えない。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - ページ分けを外すと、受け入れ条件 1 のテストが落ちる。
  - `--keep-published` のときも `match_content` を更新すると、受け入れ条件 3 のテストが落ちる。

## やってはいけないこと

- 片付けのスクリプトを本番で実行すること（dry-run も含めて、実行は Claude Code と Owner が行う）。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜4 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
