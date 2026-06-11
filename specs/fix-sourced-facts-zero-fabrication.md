# fix-sourced-facts-zero-fabrication

## 背景

`sourced_facts` が 0 件の試合（URC 準決勝など、イベントデータはあるが外部記事が見つからなかったケース）でレビュー生成すると、LLM がトレーニングデータから統計・負傷情報・選手コメントを補完して捏造する。

**根本原因**: `generate-recap.ts` / `generate-preview.ts` で `sourced_facts.length === 0` のとき `sourcedFactsBlock` が空文字列 (`""`) になり、「Web 由来の情報を使わないこと」という禁止指示が生成プロンプトから丸ごと消える。LLM は `sourced_facts` という概念自体をプロンプトで見ていない状態になり、訓練データの "helpful infilling" が起動する。

**既存ガードの限界**: `containsUnsupportedStatistic` は `%`・ポゼッション等の統計パターンを検出して retry に回す。ただし以下は検出できない:
- 選手コメント（「X 選手は『…』と語った」）
- 負傷・欠場の具体的記述
- 数値を含まない一般的事実の捏造

## スコープ

対象:
- `lib/llm/prompts/generate-recap.ts`: `PROMPT_VERSION` バンプ + zero-facts 警告追加
- `lib/llm/prompts/generate-preview.ts`: `PROMPT_VERSION` バンプ + zero-facts 警告追加
- `lib/llm/prompts/qa-content.ts`: QA プロンプトへ zero-facts 明示追加
- 上記バンプに伴うテストファイルの文字列更新

対象外:
- `containsUnsupportedStatistic` のパターン拡張（誤検知リスクが高い。別 spec で判断）
- 既存の published content の再生成（バッチ再生成は別タスク・要コスト承認）
- `sourced_facts` 取得ロジック自体の変更

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

- `generate-recap.ts`: `PROMPT_VERSION = "recap@4.8.0"`（from `4.7.0`）
- `generate-preview.ts`: `PROMPT_VERSION = "preview@3.4.0"`（from `3.3.0`）
- `qa-content.ts`: バージョン変更なし（QA プロンプトは独立バージョン管理）
- コスト影響: プロンプトトークン数微増（+20〜30 tokens）。再生成不要。

## 変更詳細

### 1. `lib/llm/prompts/generate-recap.ts`

`PROMPT_VERSION` を `"recap@4.8.0"` に変更。

`sourcedFactsBlock` の分岐を変更（L113–121 付近）:

```typescript
// Before
const sourcedFactsBlock =
  assembled.sourced_facts.length === 0
    ? ""
    : [
        "【出典付き補強事実 sourced_facts】以下はallowlist済みの信頼ソースから抽出した事実です。本文の根拠として使ってよい。",
        "使う場合は必ず自分の日本語で言い換えること。原文の長い直接引用は禁止。同一ソースから複数引用しないこと。",
        "sourced_facts に含まれないWeb由来の負傷・欠場・統計・発言を推測して書いてはならない。",
        JSON.stringify(assembled.sourced_facts),
      ].join("\n");

// After
const sourcedFactsBlock =
  assembled.sourced_facts.length === 0
    ? [
        "【sourced_facts: なし】外部記事・モデル訓練データ由来の統計・負傷・欠場・選手コメント・発言を一切使用してはならない。",
        "記述できるのは試合イベント・スコア・順位表・ラインアップなど入力データに存在するものだけ。",
        "数値を伴う統計が入力にない場合は、統計に触れずスコアの流れと戦術描写のみで構成すること。",
      ].join("\n")
    : [
        "【出典付き補強事実 sourced_facts】以下はallowlist済みの信頼ソースから抽出した事実です。本文の根拠として使ってよい。",
        "使う場合は必ず自分の日本語で言い換えること。原文の長い直接引用は禁止。同一ソースから複数引用しないこと。",
        "sourced_facts に含まれないWeb由来の負傷・欠場・統計・発言を推測して書いてはならない。",
        JSON.stringify(assembled.sourced_facts),
      ].join("\n");
```

### 2. `lib/llm/prompts/generate-preview.ts`

`PROMPT_VERSION` を `"preview@3.4.0"` に変更。

`generate-recap.ts` と同じパターンで `sourcedFactsBlock` のゼロ時分岐を変更（L45–53 付近）。

### 3. `lib/llm/prompts/qa-content.ts`

`sourcedFactsBlock` の分岐に zero-facts 警告を追加（バージョン変更なし）:

```typescript
// Before
const sourcedFactsBlock =
  matchContext.sourcedFacts && matchContext.sourcedFacts.length > 0
    ? [
        "## sourced_facts grounding",
        "以下はallowlist済み出典から抽出された許可済み事実です。本文の事実根拠としてDB入力と同等に扱ってよい。",
        "ただし、本文がこの一覧に無いWeb由来の統計・欠場・負傷・発言・カード情報を述べている場合は factual_grounding を下げること。",
        JSON.stringify(matchContext.sourcedFacts),
      ].join("\n")
    : "";

// After
const sourcedFactsBlock =
  matchContext.sourcedFacts && matchContext.sourcedFacts.length > 0
    ? [
        "## sourced_facts grounding",
        "以下はallowlist済み出典から抽出された許可済み事実です。本文の事実根拠としてDB入力と同等に扱ってよい。",
        "ただし、本文がこの一覧に無いWeb由来の統計・欠場・負傷・発言・カード情報を述べている場合は factual_grounding を下げること。",
        JSON.stringify(matchContext.sourcedFacts),
      ].join("\n")
    : [
        "## sourced_facts grounding",
        "sourced_facts はゼロです。本文がWeb由来の統計・負傷・欠場・選手コメント・発言（入力データにない内容）を含む場合は factual_grounding を 2 以下に下げること。",
      ].join("\n");
```

### 4. テストファイルのバージョン文字列更新

`"recap@4.7.0"` → `"recap@4.8.0"` に置換:
- `tests/llm/prompts/generate-recap.test.ts`（L56）
- `tests/scripts/regenerate-overseas-content.test.ts`（L166）

`"preview@3.3.0"` → `"preview@3.4.0"` に置換:
- `tests/llm/prompts/generate-preview.test.ts`（L56）
- `tests/scripts/regenerate-overseas-content.test.ts`（L165）
- `tests/llm/stages/generate-narrative.test.ts`（L270, L275, L308）
- `tests/llm/pipeline-length-revision.test.ts`（複数箇所）

`"preview@3.3.0+length-revision@1.0.0"` → `"preview@3.4.0+length-revision@1.0.0"` に置換:
- `tests/llm/pipeline-length-revision.test.ts`（複数箇所）
- `tests/llm/stages/generate-narrative.test.ts`（L275）

## 受け入れ条件

1. `sourced_facts = []` で `generateRecapPrompt` を呼ぶと、戻り値の文字列に「sourced_facts: なし」「外部記事・モデル訓練データ由来」という文言が含まれる（単体テストで確認）
2. `sourced_facts = []` で `buildQaContentPrompt` を呼ぶと、戻り値の文字列に「sourced_facts はゼロです」「factual_grounding を 2 以下に下げること」という文言が含まれる（単体テストで確認）
3. `PROMPT_VERSION` の単体テストが通る（recap@4.8.0・preview@3.4.0）
4. `pnpm test` 全体が通る
5. TypeScript strict エラーなし

## 未解決の質問

- 既存の `sourced_facts = 0` な published recap（URC 準決勝など複数件）を今回バンプ後のバッチ再生成の対象とするか → Owner が判断・承認後に別タスクで実行
