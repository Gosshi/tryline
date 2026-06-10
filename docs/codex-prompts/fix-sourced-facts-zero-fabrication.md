# Codex プロンプト: sourced_facts ゼロ時の捏造防止

仕様: `specs/fix-sourced-facts-zero-fabrication.md` を参照。

## タスク

`sourced_facts` が 0 件のとき生成プロンプトから禁止指示が抜けてしまうバグを修正する。
生成プロンプト・QA プロンプト両方を変更し、PROMPT_VERSION をバンプしてテストを更新する。

## 変更ファイルと内容

### 1) `lib/llm/prompts/generate-recap.ts`

**PROMPT_VERSION** を `"recap@4.8.0"` に変更。

**`sourcedFactsBlock` の三項演算子の falsy 分岐**（`? ""` の部分）を以下に置き換える:

```typescript
? [
    "【sourced_facts: なし】外部記事・モデル訓練データ由来の統計・負傷・欠場・選手コメント・発言を一切使用してはならない。",
    "記述できるのは試合イベント・スコア・順位表・ラインアップなど入力データに存在するものだけ。",
    "数値を伴う統計が入力にない場合は、統計に触れずスコアの流れと戦術描写のみで構成すること。",
  ].join("\n")
```

### 2) `lib/llm/prompts/generate-preview.ts`

**PROMPT_VERSION** を `"preview@3.4.0"` に変更。

`generate-recap.ts` と同じ変更を `sourcedFactsBlock` の falsy 分岐に適用する（L45–47 付近）。

### 3) `lib/llm/prompts/qa-content.ts`

**`sourcedFactsBlock` の falsy 分岐**（`: ""` の部分）を以下に置き換える:

```typescript
: [
    "## sourced_facts grounding",
    "sourced_facts はゼロです。本文がWeb由来の統計・負傷・欠場・選手コメント・発言（入力データにない内容）を含む場合は factual_grounding を 2 以下に下げること。",
  ].join("\n")
```

### 4) テストのバージョン文字列を一括更新

以下の置換を実施する（ファイルパスと行番号は仕様書参照）:

| 置換前 | 置換後 | 対象ファイル |
|--------|--------|-------------|
| `"recap@4.7.0"` | `"recap@4.8.0"` | `tests/llm/prompts/generate-recap.test.ts`, `tests/scripts/regenerate-overseas-content.test.ts` |
| `"preview@3.3.0"` | `"preview@3.4.0"` | `tests/llm/prompts/generate-preview.test.ts`, `tests/scripts/regenerate-overseas-content.test.ts`, `tests/llm/stages/generate-narrative.test.ts`, `tests/llm/pipeline-length-revision.test.ts` |
| `"preview@3.3.0+length-revision@1.0.0"` | `"preview@3.4.0+length-revision@1.0.0"` | `tests/llm/pipeline-length-revision.test.ts`, `tests/llm/stages/generate-narrative.test.ts` |

また、`tests/llm/prompts/generate-recap.test.ts` と `tests/llm/prompts/generate-preview.test.ts` に以下のテストケースを追加する:

```typescript
// generate-recap.test.ts
it("sourced_facts が空のとき zero-facts 警告が含まれる", () => {
  const prompt = generateRecapPrompt({ ...baseAssembled, sourced_facts: [] }, false, []);
  expect(prompt).toContain("sourced_facts: なし");
  expect(prompt).toContain("外部記事・モデル訓練データ由来");
});

// generate-preview.test.ts（同様）
it("sourced_facts が空のとき zero-facts 警告が含まれる", () => {
  const prompt = generatePreviewPrompt({ ...baseAssembled, sourced_facts: [] }, false, []);
  expect(prompt).toContain("sourced_facts: なし");
});
```

QA プロンプトのテスト（`tests/llm/prompts/qa-content.test.ts` がある場合）にも zero-facts 分岐のテストを追加する。

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `generate-recap.ts`・`generate-preview.ts`・`qa-content.ts`・関連テストファイル群
- マイグレーションなし、DB 変更なし
