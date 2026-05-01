# Codex Prompt: improve-content-prompts

## 目的

コンテンツ生成パイプラインの品質を改善する。初回パイプライン実行で判明した2つの問題を修正する。

1. **文字数不足**: プレビュー・レビューの生成プロンプトに最小文字数指示がなく、出力が ~500字 にとどまる（目標: プレビュー 1,500字以上、レビュー 2,000字以上）
2. **QA が甘い**: `qa-content.ts` にルーブリックがなく、500字の短いコンテンツに 4/4/4 を付けてしまう

## 変更対象ファイル

- `lib/llm/prompts/generate-preview.ts`
- `lib/llm/prompts/generate-recap.ts`
- `lib/llm/prompts/qa-content.ts`

## テスト更新対象ファイル

- `tests/llm/prompts/generate-preview.test.ts`
- `tests/llm/prompts/generate-recap.test.ts`
- `tests/llm/prompts/qa-content.test.ts`

## 現状確認（必読）

作業前に各ファイルを読んで現状を把握すること。

### `generate-preview.ts` の現状

```
PROMPT_VERSION = "preview@1.3.0"

構成指示: "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)キープレイヤーと予想(300-400字)。"
```

各セクションの目安文字数は記載されているが、「合計で最低 X 字書け」という明示的な絶対下限がない。

### `generate-recap.ts` の現状

```
PROMPT_VERSION = "recap@1.3.0"

構成指示: "構成: 1)試合全体像 2)ターニングポイント 3)MOM選出と根拠 4)次戦への示唆。"
```

各セクションに文字数指示が一切ない。

### `qa-content.ts` の現状

```
PROMPT_VERSION = "qa@1.0.0"

スキーマ: {"scores":{"information_density":1-5,"japanese_quality":1-5,"factual_grounding":1-5},...}
verdict 判定: "いずれか2以下なら retry。全て3以上なら publish。"
```

`information_density` のスコア基準が曖昧で、短い文章でも高得点がつく。

## 変更内容

### 1. `lib/llm/prompts/generate-preview.ts`

`PROMPT_VERSION` を `"preview@1.4.0"` に変更する。

構成指示の行を以下に差し替える:

```
"構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)キープレイヤーと予想(300-400字)。",
"全体で1,500字以上を目標とすること。各セクションが指定範囲の下限を下回った場合は書き足すこと。",
```

変更後のプロンプト配列（参考）:

```typescript
return [
  "あなたは日本語のラグビー専門編集者です。試合プレビューをマークダウンで作成してください。",
  "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)キープレイヤーと予想(300-400字)。",
  "全体で1,500字以上を目標とすること。各セクションが指定範囲の下限を下回った場合は書き足すこと。",
  "事実は入力データと一致させること。直接引用は15語以内。",
  "出力は日本語マークダウン本文のみ。",
  "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
  "選手名・チーム名は英語表記のまま使用すること（カタカナ変換しない）。",
  `試合データ: ${JSON.stringify(assembled)}`,
  standingsBlock,
  `戦術ポイント: ${JSON.stringify(tacticalPoints)}`,
  signalsBlock,
]
  .filter(Boolean)
  .join("\n\n");
```

### 2. `lib/llm/prompts/generate-recap.ts`

`PROMPT_VERSION` を `"recap@1.4.0"` に変更する。

構成指示の行を以下に差し替える:

```
"構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)MOM選出と根拠(300-400字) 4)次戦への示唆(300-400字)。",
"全体で2,000字以上を目標とすること。各セクションが指定範囲の下限を下回った場合は書き足すこと。",
```

変更後のプロンプト配列（参考）:

```typescript
return [
  "あなたは日本語のラグビー専門編集者です。試合レビューをマークダウンで作成してください。",
  "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)MOM選出と根拠(300-400字) 4)次戦への示唆(300-400字)。",
  "全体で2,000字以上を目標とすること。各セクションが指定範囲の下限を下回った場合は書き足すこと。",
  "事実は入力データと一致させること。直接引用は15語以内。",
  "出力は日本語マークダウン本文のみ。",
  "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
  "選手名・チーム名は英語表記のまま使用すること（カタカナ変換しない）。",
  `試合データ: ${JSON.stringify(assembled)}`,
  matchEventsBlock,
  standingsBlock,
  `戦術ポイント: ${JSON.stringify(tacticalPoints)}`,
  signalsBlock,
]
  .filter(Boolean)
  .join("\n\n");
```

### 3. `lib/llm/prompts/qa-content.ts`

`PROMPT_VERSION` を `"qa@1.1.0"` に変更する。

`buildQaContentPrompt` 関数内のプロンプト配列を以下に差し替える:

```typescript
export function buildQaContentPrompt(contentType: ContentType, narrative: string): string {
  const minLength = contentType === "recap" ? 2000 : 1500;

  return [
    "あなたは編集デスクです。以下の日本語コンテンツを品質評価してください。",
    `content_type: ${contentType}`,
    [
      "## 採点ルーブリック",
      "",
      "### information_density (1-5)",
      `- 5: ${minLength}字以上かつ具体的な試合描写・戦術分析・選手名が豊富`,
      `- 4: ${minLength}字以上かつ一般的な内容を含むが実質的な情報あり`,
      `- 3: ${Math.round(minLength * 0.75)}字以上。情報密度は普通`,
      `- 2: ${Math.round(minLength * 0.5)}字未満、または内容が薄く抽象的な記述が多い`,
      "- 1: 極めて短い、または内容がほぼない",
      "",
      "### japanese_quality (1-5)",
      "- 5: 自然な日本語。ラグビー用語が正確。読みやすい文体",
      "- 4: ほぼ自然。軽微な不自然さあり",
      "- 3: 理解可能だが不自然な表現・直訳調が散見される",
      "- 2: 文法的に誤り、または英語混じりで読みにくい",
      "- 1: 日本語として成立していない",
      "",
      "### factual_grounding (1-5)",
      "- 5: スコア・選手名・戦術がすべて入力データと一致",
      "- 4: 軽微な推測・補足あり。事実の誤りなし",
      "- 3: 一部入力にない記述があるが大筋は正確",
      "- 2: 入力データと矛盾する記述がある",
      "- 1: 事実誤認が多数または捏造が疑われる",
    ].join("\n"),
    "JSONのみで返答。スキーマ: {\"scores\":{\"information_density\":1-5,\"japanese_quality\":1-5,\"factual_grounding\":1-5},\"issues\":string[],\"verdict\":\"publish\"|\"retry\"|\"reject\"}",
    "verdict判定: いずれか2以下なら retry。全て3以上なら publish。重大欠陥で再試行価値がなければ reject。",
    `本文: ${narrative}`,
  ].join("\n\n");
}
```

## 完了条件

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test` が全グリーン
- [ ] 3ファイルの `PROMPT_VERSION` が正しく更新されている
  - `generate-preview.ts`: `preview@1.4.0`
  - `generate-recap.ts`: `recap@1.4.0`
  - `qa-content.ts`: `qa@1.1.0`
- [ ] `generate-preview.ts` に1,500字最低ラインの指示が追加されている
- [ ] `generate-recap.ts` に2,000字最低ラインの指示と各セクション文字数範囲が追加されている
- [ ] `qa-content.ts` の `information_density` ルーブリックに文字数閾値（`minLength` 変数）が組み込まれている
- [ ] プロンプトテストが `PROMPT_VERSION` と文字数指示・閾値ルーブリックを検証している
- [ ] `docs/codex-prompts/improve-content-prompts.md` が PR に含まれている

## 完了時に必ず報告すること

- 変更した `PROMPT_VERSION`
- 追加・更新したテストファイル
- `pnpm typecheck` / `pnpm test` の結果
- 作成した PR の URL

## 参照ファイル

- `lib/llm/prompts/generate-preview.ts` — 変更対象
- `lib/llm/prompts/generate-recap.ts` — 変更対象
- `lib/llm/prompts/qa-content.ts` — 変更対象
- `lib/llm/pipeline.ts` — パイプライン全体の流れ（変更不要）
