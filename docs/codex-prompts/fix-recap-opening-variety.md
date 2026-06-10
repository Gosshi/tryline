# Codex プロンプト: recap 冒頭パターン分散

仕様: `specs/fix-recap-opening-variety.md` を参照（内容はインライン展開しない）。

## タスク

`# この試合の核心` セクションが908件中37%で「得点力」フレーミングになっているパターンを解消する。
変更は 2 ファイルのみ。ロジック変更なし・プロンプトテキストの修正のみ。

## 変更ファイルと内容

### 1) `lib/llm/prompts/shared-prompt-blocks.ts`

`PROHIBITIONS_BLOCK` 配列の末尾（`.join("\n")` の直前）に以下 3 行を追加する。

```
- 「得点力の差が注目」「得点力が際立」「得点力が問われ」「得点力が光」など「得点力」で文や段落を始めるパターン（代わりに試合の転換点・決定的なプレー・スコア経緯から書き始めること）
- 「◯◯と□□の対決は」で文を始めるパターン（試合結果や核心的事実を先に置くこと）
- 「プレーオフの一発勝負」「一発勝負の意義」という冒頭定型句（具体的な意義・歴史・対戦構図から書き始めること）
```

### 2) `lib/llm/prompts/generate-recap.ts`

**a) `dataSparseBlock` の 1 行を置き換える**

現状:
```
"- recent_form の直近5試合から得点力・失点傾向・連勝/連敗ストリークを読み取り本文に反映すること",
```

変更後:
```
"- recent_form の直近5試合から連勝/連敗ストリーク・平均得失点の傾向（攻撃型 or 守備型か）・直近の勝ち方の特徴を読み取り本文に反映すること。冒頭は「得点力」で始めず、直近の試合展開・プレースタイルの特徴・今節の文脈から書き始めること",
```

**b) `structureInstruction` 内の「この試合の核心」指示を 3 分岐すべてで置き換える**

`structureInstruction` には `hasEvents` / `language` / `contentType` 等で分岐した複数の文字列テンプレートがある。
各分岐に含まれる「この試合の核心」の字数・内容指示を、以下に統一する。

現状（各分岐に存在する類似行）:
```
- この試合の核心: 200字以内。試合全体のポイントを一文で凝縮する
```
（表現は分岐ごとに微妙に異なる場合があるが、すべて置き換え対象）

変更後（3 分岐すべてに同一文言を適用）:
```
- この試合の核心: 200字以内。定型句を使わず、この試合固有の事実（最終スコア・決勝点のシチュエーション・試合の転換点）から書き始めること。
  書き方の例（パターン名は出力しない）:
  ・逆転劇型: 「79分のトライで逆転——{チーム名}が3連敗から抜け出した必然」
  ・戦術型: 「前半のスクラム圧倒が後半のペナルティ量産につながった{チーム名}の勝利構造」
  ・スコア対比型: 「{点数}対{点数}という数字より、前半と後半で別々のチームになった試合だった」
```

**c) `PROMPT_VERSION` を更新する**

現状:
```typescript
export const PROMPT_VERSION = "recap@4.6.0";
```

変更後:
```typescript
export const PROMPT_VERSION = "recap@4.7.0";
```

## 受け入れ条件（完了の定義）

- `pnpm build` 相当のビルド・TypeScript エラーなし。
- `PROHIBITIONS_BLOCK` に 3 行が追加されていること（既存行は変更しない）。
- `dataSparseBlock` の「得点力・失点傾向」フレーズが消えていること。
- `structureInstruction` の「この試合の核心」指示に 3 パターン例が含まれていること（3 分岐すべて）。
- `PROMPT_VERSION === "recap@4.7.0"` であること。

## エッジケース・注意事項

- `structureInstruction` の分岐数は 3 つ（`hasEvents` / 言語 / コンテンツタイプ等での条件分岐）。
  片方だけ更新して残りを忘れないこと。
- `PROHIBITIONS_BLOCK` の既存行（スタッツ羅列禁止・英単語禁止 等）は一切変更しない。
- `dataSparseBlock` は `generate-recap.ts` 内の配列。`generate-preview.ts` には手を加えない。

## 参考パターン

- 既存の `PROHIBITIONS_BLOCK` 末尾（`lib/llm/prompts/shared-prompt-blocks.ts`）の追加行の書き方に倣う。
- `structureInstruction` の分岐箇所は `lib/llm/prompts/generate-recap.ts` 内で `structureInstruction` を検索すると見つかる。
