# Codex 指示書: 記事に使う順位表を、試合の時点のものに限る

仕様書: `specs/fix-standings-as-of-match.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

`lib/llm/lineups.ts` の `hasCurrentStandings` を、「`played >= expected_played`」から「`played === expected_played`」（両チームとも）に変える。後の節まで進んだ順位表を、過去の試合の記事に使わないため。

## 触るファイル

- `lib/llm/lineups.ts`（`hasCurrentStandings` だけ）
- `lib/llm/prompts/generate-preview.ts`、`lib/llm/prompts/generate-recap.ts`（`PROMPT_VERSION` のパッチ版を上げるだけ）
- テスト（`tests/llm/lineups.test.ts` ほか、判定の前提が変わるもの）

## 守ること

- `freshness` が `undefined` のとき `true`、`played` が null のとき `false` という既存の動きは変えない。
- `buildStandingsBlock` と `buildUsableContentInput` のコードは変えない（判定の関数に従うだけ）。
- プロンプトの文言は変えない。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: 判定を `>=` に戻すと、受け入れ条件 1 の「`played > expected_played` → `false`」のテストが落ちること。内容と結果を PR 本文に書く。
- A のプロンプトのスナップショットに差分が出たかどうかを PR 本文に書く（出た場合はその内容）。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜5 のそれぞれについて、確認の方法と結果
  - 変えた既存テストと、その理由
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
