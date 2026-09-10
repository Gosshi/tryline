# fix-guide-audit-coverage-completeness

> GPT-6 再監査（2026-09-10）**N2（P2）**。`tools/audit-competition-guide-facts.ts` が、部分的な 2 テーブルの一致で「網羅」と判定し、日程に実在するチームを照合集合から捨てている。

## 背景

`loadActualTeamIds` は、順位表と `competition_teams` の非空集合が一致すると `coverage: "complete"` を返す（`tools/audit-competition-guide-facts.ts:434-453`、2026-09-10 実測）。

```ts
const hasCompleteStandingsCoverage = competitionIds.every((competitionId) => {
  const standingTeamIds = standingTeamIdsByCompetition.get(competitionId);
  const expectedTeamIds = expectedTeamIdsByCompetition.get(competitionId);
  return (
    standingTeamIds !== undefined && expectedTeamIds !== undefined &&
    standingTeamIds.size > 0 &&
    standingTeamIds.size === expectedTeamIds.size &&
    [...standingTeamIds].every((teamId) => expectedTeamIds.has(teamId))
  );
});

if (hasCompleteStandingsCoverage) {
  return { coverage: "complete", ..., teamIds: new Set(standingRows.map((row) => row.team_id)) };
}
```

**この分岐は `matchTeamIdsByCompetition` を一切見ない。** 既に DB から読み取っている日程上のチームが、照合集合から落ちる。

### 再現（GPT-6）

同一 competition について 順位表 `{A}` / `competition_teams` `{A}` / 日程 `{A 対 B}` / ガイド本文 `{A と B}` を与えると、結果は **`complete` / `actualDataTeams={A}` / B が guide-only 候補**。**B の存在を DB から読んでいるのに無視している。** 証拠: `docs/audits/gpt6-followup-2026-09-10/coverage-observation.test.ts`。

### 2 テーブルの一致は完全性の独立した証拠にならない

`competition_teams` が独立した完全名簿である保証はない。**`scripts/import-top-14-results.ts` は取得済み試合から `teamLookup` を作り（`:182`）、その同じ集合を `upsertCompetitionTeams` で保存する（`:186`）**（2026-09-10 実測）。取り込みが一部の試合しか拾えていなければ、**順位表と `competition_teams` は同じ取りこぼしを共有したまま一致する。**

PR #792（前回 R4）は複数 competition の例を解消したが、**単一 competition の部分取得は未解消。**

## スコープ

対象:
- 日程上のチームを照合集合から落とさない
- 完全性の判定を、根拠のあるものに限る
- テスト

対象外:
- **ガイド本文の自動修正・自動再生成**。1 行も書き込まない
- 参加国以外の事実（開催周期・優勝回数・歴史的記述）の検証
- ガイド生成プロンプトの変更
- **`competition_teams` の充足**（38 大会中 25 大会にしか行が無い。別件）
- DB への `UPDATE` / `INSERT` / マイグレーション

## データモデル変更

なし。**読み取りのみ。**

## API サーフェス / UI サーフェス

なし。

## LLM 連携

なし。コスト $0。**チーム名の抽出に LLM を使わない**（それ自体が捏造の経路になる）。

## 変更詳細

### 1. 照合集合には観測済みの全チームを保持する

`coverage` の判定結果にかかわらず、**順位表・日程・`competition_teams` の和集合**を照合に使う。日程にしか現れないチームを guide-only 候補にしない。

### 2. `complete` の条件を絞る

**少なくとも、日程に照合集合外のチームが存在すれば `complete` にしない。**

完全性を確認した名簿や期待チーム数などの独立した根拠が無ければ `incomplete` とする。**順位表と `competition_teams` の一致だけを根拠にしない。**

`coverageReason` に、何を根拠にその判定にしたかを書く（現行も文字列で説明している）。

### 3. 出力の扱い

**本文修復の前に、このツールの候補を誤りと即断しない。** 現行の注記（「実データに無いことだけでガイドの誤りとは限りません」）は維持する。

## 受け入れ条件

1. **順位表 `{A}` / `competition_teams` `{A}` / 日程 `{A 対 B}` のとき、`coverage` が `complete` にならない**ことを検証するテストがある
2. **同じ条件で B が `actualDataTeams` 側に含まれ、guide-only 候補にならない**ことを検証するテストがある
3. 日程にしか現れないチームが、どの分岐でも照合集合から落ちないことを検証するテストがある
4. `coverageReason` に判定根拠が書かれている
5. **順位表と `competition_teams` の一致だけでは `complete` にならない**ことを検証するテストがある
6. 既存の注記（実データに無い＝誤りとは限らない）が出力に残っている
7. **書き込みが 1 件も無い**。ソース中に `.insert(` / `.update(` / `.upsert(` / `.delete(` が現れない
8. LLM 呼び出しが 1 回も無い（ソース中に `getOpenAIClient` / `MODELS` が現れない）
9. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**テストの置き場所**: `tests/tools/audit-competition-guide-facts.test.ts`（`exclude` 非該当。確認済み）。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **`complete` はさらに出にくくなる。** 現状でも 38 大会中 9 大会でしか一致しておらず、本 spec でさらに絞る。**判定は保守側（不参加と断定しない）に倒れるので実害は無い**が、「網羅を確認した」と報告しないこと
