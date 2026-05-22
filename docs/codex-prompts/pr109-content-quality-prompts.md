# PR #109 — LLM コンテンツ品質改善: 戦術分析の深化と一般論禁止

## 背景

現在の自動生成コンテンツが「好調」「重要な一戦」「鍵となります」レベルの一般論になっており、
ファンに読まれる価値がない。原因は以下の3層:

1. **`extract-tactical-points`** のスキーマが曖昧で、アウトプットが「チームAのスクラムが重要」止まり
2. **`generate-preview/recap`** にペルソナの強度が不足し、禁止表現の明示もない
3. **`qa-content`** に戦術深度の採点軸がないため、一般論コンテンツが publish 判定を通過してしまう

## スコープ

対象:
- `lib/llm/types.ts` — `TacticalPoint` 型、`QaResult.scores` 型
- `lib/llm/prompts/extract-tactical-points.ts` — `extract@1.2.0` → `extract@2.0.0`
- `lib/llm/prompts/generate-preview.ts` — `preview@2.0.0` → `preview@3.0.0`
- `lib/llm/prompts/generate-recap.ts` — `recap@2.3.0` → `recap@3.0.0`
- `lib/llm/prompts/qa-content.ts` — `qa@1.2.0` → `qa@2.0.0`
- `lib/llm/stages/qa.ts` — `resolveVerdict()` の更新

対象外:
- `lib/llm/stages/` の他ファイル（`assemble.ts` 等）
- `app/` 以下のルートやコンポーネント
- データ取得・DB クエリの変更

---

## 変更仕様

### 1. `lib/llm/types.ts` — `TacticalPoint` の構造化

```ts
// Before
export type TacticalPoint = {
  point: string;
  detail: string;
  evidence: string[];
};

// After
export type TacticalPoint = {
  tactical_dimension: string;
  home_situation: string;
  away_situation: string;
  matchup_implication: string;
  match_impact: "high" | "medium" | "low";
};
```

`QaResult.scores` に `tactical_depth` を追加:

```ts
// Before
export type QaResult = {
  scores: {
    information_density: number;
    japanese_quality: number;
    factual_grounding: number;
  };
  issues: string[];
  verdict: QaVerdict;
};

// After
export type QaResult = {
  scores: {
    information_density: number;
    japanese_quality: number;
    factual_grounding: number;
    tactical_depth: number;
  };
  issues: string[];
  verdict: QaVerdict;
};
```

---

### 2. `lib/llm/prompts/extract-tactical-points.ts` — `extract@2.0.0`

`PROMPT_VERSION` を `"extract@2.0.0"` に更新し、プロンプト全体を以下に置き換える:

```ts
export function buildExtractTacticalPointsPrompt(input: AssembledContentInput): string {
  return [
    "あなたはラグビー戦術アナリストです。入力データだけを根拠に、試合の勝敗を左右する戦術的次元を3つ特定してください。",
    [
      "出力はJSONのみ。スキーマ:",
      JSON.stringify({
        tactical_points: [
          {
            tactical_dimension: "string — 戦術次元の名称 (例: スクラム優位性)",
            home_situation: "string — ホームチームのこの次元における直近の数値・実績（60字以内）",
            away_situation: "string — アウェイチームのこの次元における直近の数値・実績（60字以内）",
            matchup_implication: "string — この対比が今試合に何をもたらすか（80字以内、具体的に）",
            match_impact: "high | medium | low",
          },
        ],
      }),
    ].join("\n"),
    [
      "【禁止事項】",
      "- 「好調」「重要な局面」「鍵となります」等の一般論は一切禁止",
      "- 数値根拠のない状態描写（「最近調子が良い」等）は禁止",
      "- home_situation / away_situation は具体的な数値または試合実績のみ",
      "- 強調記号（**、*）は使用禁止",
      "- 選手名・チーム名は英語表記のまま（カタカナ変換しない）",
      "- 直接引用は15語以内",
    ].join("\n"),
    [
      "【戦術次元の例 — これ以外でも構わない】",
      "- スクラム優位性（被ペナルティ数・ドライビングモール成功率）",
      "- キックゲーム制御（exitキック精度・カウンターアタック成功率）",
      "- ラインアウト精度（自チームボール獲得率・スティール率）",
      "- ブレイクダウン速度（ターンオーバー数・ペナルティ起因）",
      "- オフロードアタック（ランメートル・ラインブレイク数）",
      "- フィールドポジション支配（テリトリー%・22m進入回数）",
    ].join("\n"),
    `入力JSON: ${JSON.stringify(input)}`,
  ].join("\n\n");
}
```

---

### 3. `lib/llm/prompts/generate-preview.ts` — `preview@3.0.0`

`PROMPT_VERSION` を `"preview@3.0.0"` に更新。

`buildGeneratePreviewPrompt` の冒頭（`return [` の第1要素）を以下に置き換える:

```ts
// Before
"あなたは日本語のラグビー専門編集者です。試合プレビューをマークダウンで作成してください。",

// After
[
  "あなたは国際ラグビーを20年取材してきたジャーナリストです。",
  "Number やRugby World誌に寄稿し、ファンが試合を深く理解できる",
  "具体的・分析的な日本語文章を書くことを使命としています。",
  "試合プレビューをマークダウンで作成してください。",
].join(""),
```

`structureInstruction` の前（`structureInstruction` を `return [...]` に追加する前）に、
以下の `coreQuestionBlock` と `prohibitionsBlock` を定数として追加し、配列に含める:

```ts
const coreQuestionBlock = [
  "## セクション0（必須、200字以内）: # この試合の核心",
  "この試合が「何 対 何の争い」なのかを1文で表す問いを設定し、その根拠を数値で示すこと。",
  "例: 「Leinsterの平均31得点アタック対Saracensの平均14失点ディフェンス——どちらの実力値が本物か」",
  "このセクションを最初に必ず出力すること。",
].join("\n");

const prohibitionsBlock = [
  "【絶対禁止表現 — 1つでも使った場合は書き直すこと】",
  "- 「好調」「好調な」「絶好調」（代わりに「直近5試合で4勝」「平均得点32点」等の数値を使うこと）",
  "- 「重要な一戦」「重要な試合」「重要な局面」",
  "- 「鍵となります」「鍵を握ります」「鍵となるのは」",
  "- 「注目のカード」「注目の一戦」",
  "- 「接戦が予想されます」（代わりに双方の数値差で接戦度を判断すること）",
  "- 「勝利を目指します」「勝利を狙います」（両チームは常に勝とうとしている）",
  "- 「〜でしょうか」で文を終える（読者は答えを期待している）",
].join("\n");
```

`return [...]` に `coreQuestionBlock` と `prohibitionsBlock` を追加:

```ts
return [
  persona,           // 上記の20年ジャーナリスト文字列
  coreQuestionBlock, // ← 新規追加
  prohibitionsBlock, // ← 新規追加
  structureInstruction,
  matchPhaseBlock,
  "各セクションが指定範囲の下限を下回った場合は書き足すこと。",
  // ... 以降は既存のまま
```

また、`戦術ポイント: ${JSON.stringify(tacticalPoints)}` の行は、新しい `TacticalPoint` 型に対応する説明文を付加:

```ts
// Before
`戦術ポイント: ${JSON.stringify(tacticalPoints)}`,

// After
[
  "戦術ポイント（tactical_dimension / home_situation / away_situation / matchup_implication を本文の根拠として使うこと）:",
  JSON.stringify(tacticalPoints),
].join("\n"),
```

---

### 4. `lib/llm/prompts/generate-recap.ts` — `recap@3.0.0`

`PROMPT_VERSION` を `"recap@3.0.0"` に更新。

generate-preview と同じ変更を適用する:

1. ペルソナを20年ジャーナリストに変更（冒頭第1要素）
2. `coreQuestionBlock` を追加（プレビューと同一内容、ただし "この試合の核心" セクションなのでレビューでは「試合前の問いへの答え」として使うこと、という補足を加える）
3. `prohibitionsBlock` を追加（プレビューと同一内容）
4. 戦術ポイントの説明文を追加（プレビューと同一内容）

`coreQuestionBlock` のレビュー向け文言:

```ts
const coreQuestionBlock = [
  "## セクション0（必須、200字以内）: # この試合の核心",
  "試合前の「何 対 何の争い」という問いに対し、実際の結果がどう答えたかを1〜2文で述べること。",
  "例: 「Leinsterの平均31得点アタックは今日も機能し、Saracensの堅守を41-12で打ち破った」",
  "このセクションを最初に必ず出力すること。",
].join("\n");
```

---

### 5. `lib/llm/prompts/qa-content.ts` — `qa@2.0.0`

`PROMPT_VERSION` を `"qa@2.0.0"` に更新。

`qualityRubric` ブロックの後（`factual_grounding` ルーブリックの後）に `tactical_depth` ルーブリックを追加:

```ts
// 採点ルーブリック配列に追加
"### tactical_depth (1-5)",
"- 5: すべての戦術ポイントに具体的な数値・選手名・プレー描写が含まれ、一般論が皆無",
"- 4: 大部分が具体的。軽微な一般論が1〜2箇所",
"- 3: 数値や具体描写はあるが「好調」「重要」等の一般論も目立つ",
"- 2: 「好調」「鍵となる」等の表層的な記述が支配的",
"- 1: ほぼすべてが一般論または機械的な要約",
```

スキーマ行を更新:

```ts
// Before
'JSONのみで返答。スキーマ: {"scores":{"information_density":1-5,"japanese_quality":1-5,"factual_grounding":1-5},"issues":string[],"verdict":"publish"|"retry"|"reject"}',
"verdict判定: いずれか2以下なら retry。全て3以上なら publish。重大欠陥で再試行価値がなければ reject。",

// After
'JSONのみで返答。スキーマ: {"scores":{"information_density":1-5,"japanese_quality":1-5,"factual_grounding":1-5,"tactical_depth":1-5},"issues":string[],"verdict":"publish"|"retry"|"reject"}',
"verdict判定: tactical_depth が 2 以下なら無条件で retry（一般論を書き直させる）。それ以外は: いずれか2以下なら retry、全て3以上なら publish、重大欠陥で再試行価値がなければ reject。",
```

---

### 6. `lib/llm/stages/qa.ts` — `resolveVerdict()` の更新

```ts
// Before
function resolveVerdict(scores: QaResult["scores"], retryCount: number): QaVerdict {
  const scoreValues = [scores.information_density, scores.japanese_quality, scores.factual_grounding];

  if (scoreValues.every((score) => score >= 3)) {
    return "publish";
  }

  if (retryCount >= 2) {
    return "reject";
  }

  return "retry";
}

// After
function resolveVerdict(scores: QaResult["scores"], retryCount: number): QaVerdict {
  // tactical_depth <= 2 は無条件 retry（一般論コンテンツを通過させない）
  if (scores.tactical_depth <= 2) {
    if (retryCount >= 2) return "reject";
    return "retry";
  }

  const scoreValues = [
    scores.information_density,
    scores.japanese_quality,
    scores.factual_grounding,
    scores.tactical_depth,
  ];

  if (scoreValues.every((score) => score >= 3)) {
    return "publish";
  }

  if (retryCount >= 2) {
    return "reject";
  }

  return "retry";
}
```

---

## 完了の定義

- [ ] `TacticalPoint` が5フィールド構造になっている
- [ ] `QaResult.scores` に `tactical_depth` が追加されている
- [ ] `extract-tactical-points.ts` のバージョンが `extract@2.0.0`
- [ ] `generate-preview.ts` のバージョンが `preview@3.0.0`、ペルソナ・禁止表現・セクション0 が含まれる
- [ ] `generate-recap.ts` のバージョンが `recap@3.0.0`、同上
- [ ] `qa-content.ts` のバージョンが `qa@2.0.0`、`tactical_depth` ルーブリックが含まれる
- [ ] `qa.ts` の `resolveVerdict()` が `tactical_depth <= 2` を強制 retry するロジックを持つ
- [ ] TypeScript エラーなし・`pnpm build` 通過
