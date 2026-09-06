仕様書 `specs/fix-recap-narrative-ignores-supplied-stats.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**手動で入れた数値スタッツとカードが、本文で1つも使われませんでした。**

2026-09-06、南アフリカ 29–24 ニュージーランド（`dcd576dd-f778-4690-b4e1-3d960bd664f1`）で実測しました。recap 用の sourced facts を14件投入して再生成したところ、スコアは改善しました（tactical_depth 3→4、issues 2→0）。

**しかし本文が使ったのは一部だけです。**

| 供給した材料 | 使用 |
|---|---|
| 公式 Player of the Match、モール20m前進、交代3枚の実名、監督の振り返り | ✓ |
| **ポゼッション57% / テリトリー53%** | **✗** |
| **タックル150対106 / 反則11対12 / ラインアウト11/11対11/12** | **✗** |
| **イエローカード2枚（理由付き）** | **✗** |

**カードの欠落が特に重いです。** 36分のペナルティトライは「Loveのイエロー → 5mスクラム選択 → 押し込んでペナルティトライ」という因果で、供給した事実にその全部が書いてあるのに、本文は経緯に触れていません。

## これは取得側の問題ではありません

`fix-recap-sourced-facts-zero-result-retry.md` と `fix-recap-sourced-facts-stats-retry-gap.md`（どちらもマージ済み）は「Web検索で数値が取れなければ再検索する」対策です。

**今回は手動で入っています。取得後に使われないという別の問題です。**

## 触るファイル

```
lib/llm/sourced-facts/statistical-fact.ts   （新規。判定の切り出し先）
lib/llm/sourced-facts/fetch.ts              （切り出し先を import。挙動は変えない）
lib/llm/prompts/generate-recap.ts
lib/llm/prompts/qa-content.ts
```

### 切り出しについて（2026-09-06 追記）

初版は「既存判定を再利用」とだけ書きましたが、**その判定は import できません。**

`STATISTICAL_FACT_PATTERN`（`fetch.ts:26`）と `containsStatisticalFact`（同 `:249`）はどちらも非 export で、`fetch.ts` は `getSupabaseServerClient` / `createWebSearchJsonResponse` / `fetchJrfuMatchLineup` を値として import しています。**QA プロンプトから引き込むべきではありません。**

**#765（`lib/ingestion/event-integrity.ts`）と同じ形で切り出してください。** import は最小限にし、QA プロンプトから安全に import できるようにします。

**切り出しは同じ PR に含めて構いません。** #765 は5本の spec が依存する土台だったので分けましたが、今回は本 spec のみが使うため分割の利得が小さいです。

**正規表現の拡張を承認します（2026-09-06、初版の「書き換えないでください」を撤回）。**

fixture で実測したところ、**現行の正規表現は18件中2件しか検出せず、うち1件は誤検出**でした。

- 検出: ポゼッション57% の fact（`%` に一致）
- 検出: `South Africa tries: … penalty try (36')` ← **`penalt` の誤検出。得点イベントであって統計ではありません**
- **未検出: 「ラインアウトは11/11対11/12。スクラム投入数は11回対5回」**

原因は前提の陳腐化です。`fix-recap-sourced-facts-stats-retry-gap`（2026-07）は「統計用語（**英語で保存されるため**）」と書いていました。その後 D026 で Owner が Discord から**日本語で手入力する経路**ができ、前提が崩れています。

**2点直してください。**

1. **日本語の統計語を追加**（ポゼッション / テリトリー / タックル / ラインアウト / スクラム / ターンオーバー / キャリー / ゲイン / 反則 など）。**「〜回」「〜本」「N/M」の形も拾えるように**
2. **`penalt\w*` の誤検出を修正**。「ペナルティトライ」「ペナルティゴール」「penalty try」「penalty goal」を統計として数えない

**フラグは増やさないでください**（現行は `/i` のみ。`g` は無いので `lastIndex` の持ち越しは起きません）。

### `fetch.ts` の再検索への影響は許容します

語彙を増やすと「数値スタッツが1件も無ければ再検索」が発火しにくくなりますが、同経路が見るのは Web 検索の戻り値で主に英語です。**日本語の手入力分は再検索の対象ではありません。**

**誤検出の修正により、`penalty try` しか含まない検索結果で再検索が発火するようになります。これは意図した改善です。** 既存テストがこの挙動変更で落ちる場合は、テスト側を直してください（PR 本文に理由を書いてください）。

**`fetch.ts` の既存テストがそのまま通ることが条件です。** 特に「数値スタッツが1件も無ければ再検索」（`fetch.ts:526` 付近）が壊れていないことが、挙動不変の証拠になります。

## 捏造を誘発しないでください

**「数値を使え」という指示が、供給されていない数値の創作を招いてはいけません。**

**供給された事実に無い数値を書いてはならない**という既存の禁止を、プロンプトに明示的に再掲してください。使えない事実を無理にこじつけないという既存の指示も残してください。

## 判定を書き起こさないでください

数値スタッツの判定は `fix-recap-sourced-facts-stats-retry-gap` が既に実装しています（数字と `%`、または penalt / tackle / possession / territory / turnover / lineout / scrum 等の統計用語を含むか）。**その実装を再利用してください。**

## fixture は用意しました

**`tests/fixtures/recap-sourced-facts-dcd576dd.json`** に、本番 DB から取得した実データ 18 件を記録しました。受け入れ条件 1〜3 のテストはこれを使ってください。**本番 DB へアクセスする必要はありません。**

`fact` / `source_url` / `source_domain` / `confidence` が `SourcedFactInput`（`lib/llm/types.ts:140`）に対応します。`entryMethod` は由来の記録用で、`SourcedFactInput` には含まれません。**テストで渡すときは除いてください。**

`expectedUnusedInNarrative` に、本文が使わなかった数値6項目とカード2件を列挙してあります。

**初版で「14件」と書いたのは不正確でした。** 手動投入は14件ですが、再生成時に `fetch-sourced-facts` が自動で4件を追加しており、**生成時点では18件**存在していました。

## 必ず入れるテスト

**数値スタッツもカードも供給されていない試合で、本ゲートが一切適用されないこと。**

`match_team_stats` は全期間0行で、数値が供給されている試合は例外的です。**ここを誤ると全試合が減点されます。**

## 変えてはいけないもの

**採点軸を増やさないでください。** 4軸（information_density / japanese_quality / factual_grounding / tactical_depth）のままです。

**リトライ上限を上げないでください。** QA に減点軸を足すと retry が増えます。上限は現行のままにしてください。

`PROMPT_VERSION` は `generate-recap.ts` と `qa-content.ts` の**両方**をバンプしてください。

## 再生成はしないでください

プロンプトをバンプすると既存の公開記事は古い版のままになりますが、**全件再生成は本 PR に含めないでください。** 900本規模で費用が大きく、2026-06 に297件が draft 化して本番から消えた事故があります（`project_regen_length_incident`）。対象範囲は Owner が実装後に決めます。

## テスト

**`pnpm test` だけを完了根拠にしないでください。** `vitest.config.ts` の `exclude` が `tests/llm/pipeline.test.ts` と `tests/llm/stages/assemble.test.ts` を実行しません。除外されていない新規ファイルに置くか、除外を外した実行コマンドを用意し、**実行結果を PR 本文に貼ってください。**
