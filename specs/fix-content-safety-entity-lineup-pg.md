# 記事生成の安全面 3 件の修正（人名照合の除外経路・未確定メンバーの流入・PG 数の意味）

## 背景

GPT-6 のプロンプト監査（`docs/content-prompt-audit-2026-09-24.md` の P1）で見つかった 3 件を、Claude Code がコードで確認した（2026-09-24）。いずれも**今の本番の記事生成に関わる**。書き換えプロンプトの A/B 比較（`specs/feat-content-prompt-ab-experiment.md`）とは別に、先に直す。

### 1. 表記辞書に載った選手は、人名照合を素通りする

- `buildKnownNonPersonNames`（`lib/content/allowed-entities.ts:95`）は、`japanese_name_glossary` の**全項目**（`:128-131`）を「人名でない語」のリストに入れる。
- `verifyNarrativeEntities` の結果を判定する処理（`lib/llm/stages/verify-entities.ts:116`、`:125`）は、このリストに入っている表記を検査の対象から外す。
- ところが表記辞書には、チーム名・大会名だけでなく選手（`kind: "player"`）も入る。選手の出どころは、試合のイベント、予想ラインアップ（**未確定を含む**）、そして **2 チームの所属選手のうち日本語名を持つ全員**（`lib/llm/stages/assemble.ts:1177-1182`、`loadTeamRosterPlayerNameReferences`）。
- その結果、確定ラインアップにもイベントにも sourced_facts にもいない選手が本文に出ても、人名ゲートを通ってしまう。
- 経緯:
  - 2026-07-05 `fe2888a`（「人名でない語は無視する」）の時点では、表記辞書はチーム名・大会名の用途だった。
  - 2026-08-08 `688b130`（表記辞書を所属選手全体に拡張）で、除外の範囲が所属選手全体に広がった。
- 規模: 日本語名を持つ選手は現在 **23 人（9 チーム）**（2026-09-24 本番 DB の実測）。ただし、残り約 1,700 人に日本語名を付けるバックフィルを進めると、ほぼ全選手がゲートを素通りするようになる。**バックフィルより前に直す必要がある。**

### 2. 未確定メンバーと古い順位表が、一部の経路から LLM に渡る

- 日本語の本文生成（`generate-preview.ts:238`、`generate-recap.ts:318`）と QA（`pipeline.ts:311`、`:394`）は、未確定のラインアップを外し、古い順位表も外している。
- 次の経路は、`assemble` の出力をそのまま渡している。
  - 段 2 の抽出: `extractTacticalPoints(assembled, …)`（`pipeline.ts:319`）
  - 日本語の加筆: `reviseNarrativeLength({ assembled, … })`（`pipeline.ts:632` → `generate-narrative.ts:224`）
  - 英語の本文と加筆: `generate-narrative.ts:310`、`:350`
- 抽出が未確定の選手や古い順位を材料にして論点を作ると、その論点は本文の「根拠」として渡る。加筆のときは、未確定メンバーを直接見て書き足せる。

### 3. PG の成功本数を「反則の傾向」として扱わせている

- `key_stats.match.penalty_count`（`assemble.ts:126-131`、`:149`）は、**成功したペナルティゴールの本数**を数えた値で、反則の数ではない。
- それなのに、次の 2 か所がこの値を反則や試合の性格の指標として使わせている。
  - 抽出プロンプトの例: 「規律と反則傾向（key_stats.match.penalty_count）」（`extract-tactical-points.ts:55`）
  - データが乏しいときのレビュー: 「penalty_count の合計が 8 以上の場合、テリトリー・プレッシャー型の試合と評価すること」（`generate-recap.ts:248`）
- 項目名が `penalty_count` なので、上の 2 か所を消しても、JSON を読む LLM が反則数と取り違える余地が残る。

## スコープ

**対象**
1. 人名照合で「人名でない語」として外すのを、チーム名・大会名だけにする。許可された選手の日本語表記は、許可された名前の**別表記**として認める。
2. 本文生成・加筆・抽出・QA が、同じ「使ってよい入力」を受け取るようにする（日本語・英語とも）。
3. `penalty_count` を `penalty_goal_count` に改名し、反則の傾向として使わせている 2 か所の指示を直す。
4. 修正後に、公開済みの記事を既存の監査ツールで検査する（実行は Claude Code）。

**対象外**
- 表記辞書そのものの中身（所属選手を載せること）は変えない。表記辞書は読み方の辞書として残し、使用許可とは切り離す。
- sourced_facts の短い人名が照合で一致しない問題（`verify-entities.ts:49` の最小文字数）。
- QA のガード（`qa.ts`）、採点基準、見出し構成、字数の変更。
- A/B 比較の仕組み。

## データモデル変更

なし。DB のテーブルは変えない。`pipeline_runs.output` に保存済みの過去の `assembled` には旧名の `penalty_count` が残るが、これを読むコードは無い（`grep -rn penalty_count lib app components scripts tools` の結果は、型・集約・プロンプト 2 か所だけ）。

## API サーフェス

### 1. 人名照合（`lib/content/allowed-entities.ts`、`lib/llm/stages/verify-entities.ts`）

- `buildKnownNonPersonNames`: `japanese_name_glossary` から入れるのは `kind` が `team` と `competition` の項目だけ。`kind: "player"` は入れない。チーム名・大会名・会場などの他の入れ先は変えない。
- `buildAllowedPersonEntities`: 許可された人物（確定ラインアップ・イベント）ごとに、`japanese_name_glossary` の `kind: "player"` の項目で `source` が一致するもの（空白を詰め、大文字小文字を区別しない比較）があれば、その `japanese` を**同じ source の許可人物**として加える。
  - 例: 許可人物 `Michael Leitch` に表記辞書の `{source: "Michael Leitch", japanese: "リーチ マイケル"}` があれば、`リーチ マイケル` も許可する。
  - 許可されていない選手の日本語表記は加えない。
- 照合プロンプト（`verify-entities.ts` の `buildVerifyEntitiesPrompt`）の文言は変えない。許可リストに日本語表記が加わるだけ。

### 2. 使ってよい入力（新規 `buildUsableContentInput`）

- 新しい関数を `lib/llm/lineups.ts` に置く。
  ```ts
  export function buildUsableContentInput(
    assembled: AssembledContentInput,
  ): AssembledContentInput
  ```
  - `sanitizeUnconfirmedProjectedLineups(assembled)` を適用する。
  - `hasCurrentStandings(assembled.standings_freshness)` が偽なら、`competition_standings` を `[]` にする。
  - それ以外の項目は変えない。
- `hasCurrentStandings` は今 `lib/llm/prompts/shared-prompt-blocks.ts:68` にある。import の都合で移す場合は、`lib/llm/lineups.ts` に置き、`shared-prompt-blocks.ts` からは再 export する（既存の import を壊さない）。
- `generateMatchContent`（`pipeline.ts`）で、段 1 の整合性チェックの直後に 1 回だけ `const usable = buildUsableContentInput(assembled)` を作り、次のすべてに `usable` を渡す。
  - `extractTacticalPoints`（`:319`）
  - `generateNarrative`（`:462`。日本語・英語とも）
  - `reviseNarrativeLength`（`:632`。日本語・英語とも）
  - `buildAllowedPersonEntities`、`buildKnownNonPersonNames`（`:312-313`）
  - QA の `matchContext` の組み立て（今の `qaAssembled` と、`:394` の順位の出し分けは `usable` に置き換える）
  - 段 2 の `inputHash`
- `assembled` をそのまま使ってよいのは、段 1 の記録（`recordPipelineRun` の stage 1）と、段 1 の整合性チェックだけ。

### 3. `penalty_goal_count`

- `lib/llm/types.ts:276` の `penalty_count` を `penalty_goal_count` に改名し、`assemble.ts:149` とテストを追従させる。
- `extract-tactical-points.ts:55` を次に変える。
  - 変更前: `"- 規律と反則傾向（key_stats.match.penalty_count）"`
  - 変更後: `"- 得点手段の偏り（key_stats.match.try_count と penalty_goal_count。penalty_goal_count は成功したペナルティゴールの本数で、反則数ではない）"`
- `generate-recap.ts:248` の行（「penalty_count の合計が 8 以上…」）を**削除する**。
- 版番号を上げる。
  - `extract@2.3.0` → `extract@2.4.0`
  - `recap@4.20.0` → `recap@4.21.0`
  - `preview@3.15.0` → `preview@3.15.1`（プレビューはプロンプトの文言を変えないが、中に埋め込む入力 JSON の項目名が変わるため）

## UI サーフェス

なし。

## LLM 連携

- 呼び出しの回数・モデル・プロンプトの構成は変わらない。費用も変わらない。
- 日本語の本文プロンプトは、項目名の改名と `generate-recap.ts:248` の削除を除けば、**同じ文字列になる**。ビルダーは既に同じ除外（未確定メンバーと古い順位表）を自分の中でしており、同じ除外を 2 回かけても結果は変わらないため。
- 変わるのは、抽出・加筆・英語の本文と加筆に渡る入力（未確定メンバーと古い順位表が入らなくなる）と、人名照合の判定。

## 受け入れ条件

1. **所属選手だけの選手は検出される**（`verify-entities` の解析のテスト）。
   - 前提: 許可人物と sourced_facts が空で、表記辞書に `{kind:"player", source:"Test Player", japanese:"テスト選手"}` がある。
   - 照合結果: `{surface:"テスト選手", matched_entity:null}`。
   - 期待: `ungroundedSurfaces` が `["テスト選手"]` になる。
   - 確認方法: `buildKnownNonPersonNames` の `kind` の絞り込みを外すと、このテストが落ちること。
2. **許可された選手の日本語表記は通る。**
   - 前提: 許可人物 `Test Player`（確定ラインアップ）と、上と同じ表記辞書。
   - 照合結果: `{surface:"テスト選手", matched_entity:"テスト選手"}`。
   - 期待: `ungroundedSurfaces` が空。
   - 確認方法: 別表記を加える処理を外すと落ちること。
3. **チーム名・大会名の日本語表記は、今までどおり外される。**
   - 前提: 表記辞書に `{kind:"team", source:"Stade Toulousain", japanese:"トゥールーズ"}`。
   - 照合結果: `{surface:"トゥールーズ", matched_entity:null}`。
   - 期待: `ungroundedSurfaces` が空。
4. **未確定側の表記辞書だけに載っている選手は許可されない。**
   - 前提: ホームは確定、アウェイは未確定。アウェイの選手の日本語表記が表記辞書にある。
   - 期待: `buildAllowedPersonEntities` の結果に、その選手の英語名も日本語表記も入らない。
5. **使ってよい入力が、すべての経路に渡る**（`generateMatchContent` のテスト。LLM はモック）。
   - 前提: 片側だけ未確定のラインアップ、順位が古い（`standings_freshness` が期待試合数を下回る）入力。
   - 期待: `extractTacticalPoints`、`generateNarrative`（日本語・英語）、`reviseNarrativeLength`（日本語・英語）に渡った入力の中に、未確定側の選手名が 0 件で、`competition_standings` が `[]` であること。
   - 確認方法: 抽出への引数を `assembled` に戻すと落ちること。
6. **日本語の本文プロンプトは、改名と 1 行の削除以外は変わらない。**
   - 変更前の main で、既存テストの fixture を使って組み立てた日本語の本文プロンプトを、次の 4 通りで保存する。
     - プレビュー 1 通り
     - レビュー 3 通り（ラインアップあり／データが乏しい／イベントのみ）
   - 変更後の出力が「`penalty_count` を `penalty_goal_count` に置き換え、`generate-recap.ts:248` の行を除いたもの」と完全に一致すること。
   - この保存は、コードを変える前に行う。
7. `grep -rn "penalty_count" lib app components scripts tools` が 0 件になる（新しい名前 `penalty_goal_count` は文字列 `penalty_count` を含まないので、この検索で旧名だけを数えられる）。`tests/` 配下にも旧名を残さない。
8. `extract-tactical-points.ts` の出力に「規律と反則傾向」が含まれず、`generate-recap.ts` の出力に「テリトリー・プレッシャー型」が含まれないことを確かめるテストがある。
9. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

10. 公開済みの記事を `tools/audit-entity-grounding.ts` で検査する。このツールには日付で絞る指定がないので、公開済みの記事全体が対象になる。まず dry-run（LLM を呼ばない）で件数を出す。
    - このツールは LLM を呼ぶので、実行前に件数と費用の見積もりを Owner に示して承認を得る（`--confirm-owner-approved`）。
    - 修正後の判定で根拠のない人名が見つかった記事は、一覧にして Owner に報告する。記事の修正方針は Owner が決める。
11. 次の Live Pipeline の実行で、生成が普段どおり通ることを確かめる（人名ゲートでの不合格が急に増えていないか）。

## 未解決の質問

1. バックフィルを再開するのは、この修正のマージ後にする（推奨）。
2. A/B 比較（`specs/feat-content-prompt-ab-experiment.md`）は、この修正のマージ後の main から着手する。A/B の受け入れ条件 1 は「現行 A が変わらないこと」を保存したプロンプトとの比較で確かめるので、先にこの修正を入れておかないと、比較の基準がずれる。A/B の spec にある本番の版番号（`preview@3.15.0`、`recap@4.20.0`）は、この修正後の版（`preview@3.15.1`、`recap@4.21.0`）に読み替える。
