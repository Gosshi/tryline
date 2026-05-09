# feat: match_events・ラインアップ非対応大会向けレビュー品質改善

## 背景

URC・Top 14・Super Rugby Pacific・Rugby Championship では、Wikipedia に vevent 構造がなく
`match_events` も `projected_lineups` も取得できない。現状のプロンプトは両データが空の場合に
「選手名に言及しない」と指示するだけで、2,000字の密度あるレビューをどう書くかを示していない。

その結果、これらの大会のレビューは次の問題を抱える:

- スコア以外の事実の拠り所がなく抽象的な記述になりやすい
- LLM が「データがないため詳述できません」類の逃げを打ちやすい
- `recent_form`・`competition_standings`・`key_stats`・`h2h_last_5` が未活用

本 PR は **データスパース条件（両方空）を明示的に検知し、代替コンテンツ戦略をプロンプトに組み込む**。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `lib/llm/prompts/generate-recap.ts` | データスパースブロック追加、構成指示分岐、バージョン更新 |
| `lib/llm/prompts/generate-preview.ts` | 同上（プレビュー向け） |

テスト（任意、あれば対応）:
- `tests/llm/prompts/generate-recap.test.ts`
- `tests/llm/prompts/generate-preview.test.ts`

---

## 変更内容

### 1. `lib/llm/prompts/generate-recap.ts`

`PROMPT_VERSION` を `"recap@1.9.0"` に変更する。

`buildGenerateRecapPrompt` 関数内で、以下の変数を追加する:

```typescript
const hasEvents = assembled.match_events.length > 0;
const hasLineups =
  assembled.projected_lineups.home.length > 0 ||
  assembled.projected_lineups.away.length > 0;
const isDataSparse = !hasEvents && !hasLineups;
```

`structureInstruction` の分岐を3分岐に更新する:

```typescript
const structureInstruction = hasLineups
  ? "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)MOM選出と根拠(300-400字) 4)次戦への示唆(300-400字)。全体で2,000字以上を目標とすること。"
  : isDataSparse
    ? "構成: 1)試合全体像とスコア分析(500-600字) 2)大会文脈・順位への影響(400-500字) 3)両チームの近況と戦術傾向(500-600字) 4)次戦への示唆(300-400字)。全体で2,000字以上を目標とすること。MOM セクションは省略すること。"
    : "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)次戦への示唆(300-400字)。MOM セクションは省略すること（ラインアップデータなし）。全体で1,500字以上を目標とすること。";
```

データスパースブロックを新たに追加する（`matchEventsBlock` の後に挿入）:

```typescript
const dataSparseBlock = isDataSparse
  ? [
      "【データスパースモード】スコアラー・ラインアップデータは存在しない。以下の代替戦略でレビューを構成すること:",
      "- 最終スコアの点差・試合の締め方から展開を推論し、具体的な記述（例: 後半のペナルティ累積、接戦の終盤など）を行うこと",
      "- recent_form の直近5試合から得点力・失点傾向・連勝/連敗ストリークを読み取り本文に反映すること",
      "- competition_standings の順位変動（この試合結果による上昇/下降）を必ず計算して記述すること",
      "- h2h_last_5 の直近対戦スコアを引用し、今回の結果との比較を行うこと",
      "- key_stats の直近平均得点・失点と今回のスコアを対比して試合の特徴を示すこと",
      "- 「詳細不明」「データがない」等の逃げ表現は一切禁止。手元のデータで書き切ること",
    ].join("\n")
  : "";
```

プロンプト配列に `dataSparseBlock` を追加する（`matchEventsBlock` の直後）:

```typescript
return [
  "あなたは日本語のラグビー専門編集者です。試合レビューをマークダウンで作成してください。",
  structureInstruction,
  "各セクションが指定範囲の下限を下回った場合は書き足すこと。",
  "事実は入力データと一致させること。直接引用は15語以内。",
  "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
  "出力は日本語マークダウン本文のみ。",
  "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
  nameStyleInstruction,
  "試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
  `試合データ: ${JSON.stringify(assembled)}`,
  matchEventsBlock,
  dataSparseBlock,
  standingsBlock,
  `戦術ポイント: ${JSON.stringify(tacticalPoints)}`,
  signalsBlock,
]
  .filter(Boolean)
  .join("\n\n");
```

### 2. `lib/llm/prompts/generate-preview.ts`

`PROMPT_VERSION` を `"preview@1.8.0"` に変更する。

`buildGeneratePreviewPrompt` 関数内で以下を追加する:

```typescript
const hasLineups =
  assembled.projected_lineups.home.length > 0 ||
  assembled.projected_lineups.away.length > 0;
const isDataSparse = assembled.match_events.length === 0 && !hasLineups;
```

`structureInstruction` を追加（既存の固定文字列を条件分岐に変更）:

```typescript
const structureInstruction = hasLineups
  ? "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)キープレイヤーと予想(300-400字)。全体で1,500字以上を目標とすること。"
  : isDataSparse
    ? "構成: 1)両チーム現状と近況(500-600字) 2)大会文脈・この試合の意味(400-500字) 3)戦術傾向と注目ポイント(400-500字)。全体で1,500字以上を目標とすること。キープレイヤーセクションは省略すること（ラインアップデータなし）。"
    : "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)戦術傾向と展望(300-400字)。全体で1,500字以上を目標とすること。キープレイヤーセクションは省略すること（ラインアップデータなし）。";
```

データスパースブロックを追加:

```typescript
const dataSparseBlock = isDataSparse
  ? [
      "【データスパースモード】ラインアップデータは存在しない。以下の代替戦略でプレビューを構成すること:",
      "- recent_form の直近5試合スコアから攻撃力・守備力・連勝/連敗ストリークを読み取り本文に反映すること",
      "- competition_standings の現在順位・勝ち点差から、この試合の大会的意味を具体的に述べること",
      "- h2h_last_5 の直近対戦傾向を引用し、今回の試合との比較・見どころを示すこと",
      "- key_stats の直近平均得点・失点を使い、この試合の予想スコアレンジや拮抗度を推論すること",
      "- 「情報が少ない」「選手不明」等の逃げ表現は一切禁止。手元のデータで書き切ること",
    ].join("\n")
  : "";
```

プロンプト配列を更新:

```typescript
return [
  "あなたは日本語のラグビー専門編集者です。試合プレビューをマークダウンで作成してください。",
  structureInstruction,
  "各セクションが指定範囲の下限を下回った場合は書き足すこと。",
  "事実は入力データと一致させること。直接引用は15語以内。",
  "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
  "出力は日本語マークダウン本文のみ。",
  "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
  nameStyleInstruction,
  "試合結果はデータ内の home_score と away_score が正確な最終スコアである。スコアが高いチームが勝者。この事実を文章の根拠として使うこと。",
  `試合データ: ${JSON.stringify(assembled)}`,
  dataSparseBlock,
  standingsBlock,
  `戦術ポイント: ${JSON.stringify(tacticalPoints)}`,
  signalsBlock,
]
  .filter(Boolean)
  .join("\n\n");
```

---

## 実装上の注意

- `isDataSparse` の判定は「match_events も lineups も空」という AND 条件。どちらか一方でもあれば通常モード
- `dataSparseBlock` は `.filter(Boolean)` で空文字列が除去されるため、非スパースモードでは何も追加されない
- `generate-preview.ts` は現在 `hasLineups` 変数を定義していないため、新たに追加すること
- `PROMPT_VERSION` が変わるため、既存の `match_content` は自動的には再生成されない。再生成が必要な場合は `prompt_version` を UPDATE してから `regenerate-overseas-content.ts` を実行する

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] `generate-recap.ts` の `PROMPT_VERSION` が `"recap@1.9.0"` になっている
- [ ] `generate-preview.ts` の `PROMPT_VERSION` が `"preview@1.8.0"` になっている
- [ ] 両ファイルに `isDataSparse` 判定と `dataSparseBlock` が実装されている
- [ ] データスパース時の構成指示（standings 活用・recent_form 活用・逃げ禁止）がプロンプトに含まれている

---

## 参照ファイル

| ファイル | 参照目的 |
|---------|---------|
| `lib/llm/prompts/generate-recap.ts` | 変更対象（現行: `recap@1.8.0`） |
| `lib/llm/prompts/generate-preview.ts` | 変更対象（現行: `preview@1.7.0`） |
| `lib/llm/types.ts` | `AssembledContentInput` の型定義 |
