# Codex 指示書: 記事生成の安全面 3 件を直す

仕様書: `specs/fix-content-safety-entity-lineup-pg.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

1. **人名照合の除外経路:** 表記辞書（`japanese_name_glossary`）に載った選手が「人名でない語」として扱われ、人名ゲートを素通りする。除外するのはチーム名・大会名だけにし、許可された選手の日本語表記は別表記として許可する。
2. **未確定メンバーの流入:** 抽出・加筆・英語版の本文に、未確定のラインアップと古い順位表が渡っている。`buildUsableContentInput` を 1 回作り、すべての経路に渡す。
3. **PG の数の意味:** `penalty_count`（成功したペナルティゴールの本数）を `penalty_goal_count` に改名し、反則の傾向として扱わせている指示 2 か所を直す。

## 触るファイル

- `lib/content/allowed-entities.ts`
- `lib/llm/lineups.ts`（`buildUsableContentInput` の追加。`hasCurrentStandings` を移す場合も、ここに置く）
- `lib/llm/prompts/shared-prompt-blocks.ts`（`hasCurrentStandings` を移した場合の再 export だけ）
- `lib/llm/pipeline.ts`
- `lib/llm/types.ts`、`lib/llm/stages/assemble.ts`（改名）
- `lib/llm/prompts/extract-tactical-points.ts`（`:55` の変更、`PROMPT_VERSION` の更新）
- `lib/llm/prompts/generate-recap.ts`（`:248` の削除、`PROMPT_VERSION` の更新）
- `lib/llm/prompts/generate-preview.ts`（`PROMPT_VERSION` の更新だけ）
- 関係するテスト（`grep -rln penalty_count tests` で 10 ファイル）

## 進める順番

1. **最初に、変更前の main で日本語の本文プロンプトを保存する**（受け入れ条件 6）。コードを変える前にやること。
2. 人名照合の修正と、受け入れ条件 1〜4 のテスト。
3. `buildUsableContentInput` と pipeline の配線、受け入れ条件 5 のテスト。
4. 改名とプロンプトの 2 か所の修正、受け入れ条件 6〜8 のテスト。

## 守ること

- 人名照合のプロンプト（`lib/llm/prompts/verify-entities.ts`）の文言は変えない。
- 表記辞書の中身（所属選手を載せること）は変えない。表記辞書は読み方の辞書として残す。
- QA のガード（`qa.ts`）、採点基準（`qa-content.ts`）、見出し構成、字数、モデルは変えない。
- 日本語の本文プロンプトは、改名と `generate-recap.ts:248` の削除以外、1 文字も変えない。
- 段 1 の記録（stage 1 の `recordPipelineRun`）と整合性チェックは、今の `assembled` を使ったままにする。

## 処理すべきエッジケース

1. 同じ英語名の選手が表記辞書に 2 回出る場合: `buildJapanesePlayerNameGlossary` は重複を除いているが、許可人物に別表記を加えるときも、同じ名前を 2 度加えない（`appendEntity` の重複除外を使う）。
2. 表記辞書の `source` と許可人物の名前で、空白や大文字小文字が違う場合: どちらも空白を詰め、大文字小文字を区別せずに比べる。
3. `projected_lineups.confirmed` がある場合と無い場合の両方で、未確定の側を正しく外す（`sanitizeUnconfirmedProjectedLineups` の既存の判定を使う）。
4. `standings_freshness` が無い入力: `hasCurrentStandings` は `true` を返す（既存の挙動）。そのまま順位表を残す。
5. 英語版（League One の英語版など）でも同じ入力を使う。英語の本文プロンプトの文言は変えない。
6. 人名ゲートの判定が厳しくなるので、既存のテストで「表記辞書の選手が許可される」ことを前提にしたものがあれば、変える前に止めて報告する（その前提は、この修正で意図的に変わる挙動）。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - `buildKnownNonPersonNames` の `kind` の絞り込みを外すと、受け入れ条件 1 のテストが落ちる。
  - 別表記を加える処理を外すと、受け入れ条件 2 のテストが落ちる。
  - 抽出への引数を `assembled` に戻すと、受け入れ条件 5 のテストが落ちる。
- `grep -rn "penalty_count" lib app components scripts tools tests` の結果（0 件）を PR 本文に貼る。

## やってはいけないこと

- 人名ゲートを緩めること（表記辞書の選手を一律に許可する、照合で null になったものを通す、など）。
- `tools/audit-entity-grounding.ts` を実行すること（LLM を呼ぶので、実行はマージ後に Claude Code が Owner の承認を得て行う）。
- DB のマイグレーションや、既存記事の書き換え。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜9 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
  - 上記の grep の結果
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
