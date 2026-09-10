仕様書 `specs/fix-guide-audit-coverage-completeness.md` を実装してください。**先に全文を読んでください。**

GPT-6 再監査（2026-09-10）の **N2（P2）**。読み取り専用ツールの判定だけを直します。

## 何が問題か

`tools/audit-competition-guide-facts.ts:434-453` の `hasCompleteStandingsCoverage` は、順位表と `competition_teams` の非空集合が一致すると `coverage: "complete"` を返します。**この分岐は `matchTeamIdsByCompetition` を一切見ません。**

`complete` の戻り値は `teamIds: new Set(standingRows.map((row) => row.team_id))` なので、**日程にしか現れないチームが照合集合から落ちます。**

### 再現（GPT-6）

同一 competition について 順位表 `{A}` / `competition_teams` `{A}` / 日程 `{A 対 B}` / ガイド本文 `{A と B}` を与えると、結果は **`complete` / `actualDataTeams={A}` / B が guide-only 候補**。**B の存在を DB から読んでいるのに無視しています。**

証拠: `docs/audits/gpt6-followup-2026-09-10/coverage-observation.test.ts`

### 2 テーブルの一致は完全性の証拠になりません

`competition_teams` は独立した名簿ではありません。**`scripts/import-top-14-results.ts` は取得済み試合から `teamLookup` を作り（`:182`）、その同じ集合を `upsertCompetitionTeams` で保存します（`:186`）**（2026-09-10 実測）。取り込みが一部の試合しか拾えていなければ、**順位表と `competition_teams` は同じ取りこぼしを共有したまま一致します。**

PR #792 は複数 competition の例を解消しましたが、単一 competition の部分取得が残っています。

## やること

1. **照合集合には観測済みの全チームを保持する。** 順位表・日程・`competition_teams` の和集合を使い、日程にしか現れないチームを guide-only 候補にしない
2. **`complete` の条件を絞る。** 少なくとも日程に照合集合外のチームが存在すれば `complete` にしない。独立した根拠が無ければ `incomplete` とする
3. `coverageReason` に判定根拠を書く（現行も文字列で説明しています）

## やってはいけないこと

- **ガイド本文への書き込み。** 1 行も書き込まないでください（`.insert(` / `.update(` / `.upsert(` / `.delete(` がソースに現れないこと）
- **LLM を呼ぶこと。** チーム名の抽出に LLM を使わないでください。それ自体が捏造の経路になります
- 既存の注記（「実データに無いことだけでガイドの誤りとは限りません」）を消すこと
- `competition_teams` を埋めること（38 大会中 25 大会にしか行が無い。別件です）
- DB への `UPDATE` / `INSERT` / マイグレーション

## 完了の定義

受け入れ条件 1〜9 を満たすこと。特に:

- **順位表 `{A}` / `competition_teams` `{A}` / 日程 `{A 対 B}` で `complete` にならない**（条件 1）
- **B が `actualDataTeams` 側に入り guide-only 候補にならない**（条件 2）
- **順位表と `competition_teams` の一致だけでは `complete` にならない**（条件 5）
- 書き込み 0 件（条件 7）・LLM 呼び出し 0 件（条件 8）

テストは `tests/tools/audit-competition-guide-facts.test.ts`（`exclude` 非該当。確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**`complete` はさらに出にくくなります。** 現状でも 38 大会中 9 大会でしか一致していません。判定は保守側に倒れるので実害はありませんが、「網羅を確認した」と報告しないでください。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
