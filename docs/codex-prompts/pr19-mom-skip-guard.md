# fix: ラインアップなし試合の MOM セクションをスキップ

## 目的

`match_lineups` が 0 件の試合で recap を生成すると、
LLM がラインアップデータを持たないまま MOM（Man of the Match）を選出し、
架空の選手名（例: "Yamada Hiroshi"）を hallucination する。

`buildGenerateRecapPrompt` でラインアップの有無を判定し、
ラインアップなしの場合は MOM セクションをプロンプトから除外する。

## 参照すべきファイル

- `lib/llm/prompts/generate-recap.ts` — 修正対象（`buildGenerateRecapPrompt`、32 行目の構成指示）
- `lib/llm/prompts/generate-preview.ts` — 同様の MOM 言及があれば修正
- `lib/llm/types.ts` — `AssembledContentInput.projected_lineups` の型確認
- `lib/llm/stages/generate-narrative.ts` — 呼び出し元の確認（変更なし）

## 修正

### `lib/llm/prompts/generate-recap.ts`

`assembled.projected_lineups.home` と `away` の合計長でラインアップの有無を判定する。
ラインアップなし → MOM セクションを構成から除外し、3 セクション構成にする。

```ts
export function buildGenerateRecapPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const hasLineups =
    assembled.projected_lineups.home.length > 0 ||
    assembled.projected_lineups.away.length > 0;

  const structureInstruction = hasLineups
    ? "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)MOM選出と根拠(300-400字) 4)次戦への示唆(300-400字)。全体で2,000字以上を目標とすること。"
    : "構成: 1)試合全体像(400-500字) 2)ターニングポイント(500-600字) 3)次戦への示唆(300-400字)。MOM セクションは省略すること（ラインアップデータなし）。全体で1,500字以上を目標とすること。";

  const signalsBlock =
    additionalSignals.length === 0
      ? ""
      : `外部シグナル(距離を取った帰属表現で利用): ${JSON.stringify(additionalSignals)}`;

  const standingsBlock =
    assembled.competition_standings.length === 0
      ? ""
      : [
          `現在の大会順位表（この試合前時点）: ${JSON.stringify(assembled.competition_standings)}`,
          "順位争い・Grand Slam・木のスプーン等の大会文脈をレビューに組み込むこと。",
        ].join("\n");

  const matchEventsBlock =
    assembled.match_events.length === 0
      ? ""
      : `スコアリングイベント（tryスコアラー・コンバージョン・ペナルティ・カード等）は以下のデータのみを根拠に記述すること:\n${JSON.stringify(assembled.match_events)}`;

  return [
    "あなたは日本語のラグビー専門編集者です。試合レビューをマークダウンで作成してください。",
    structureInstruction,
    "各セクションが指定範囲の下限を下回った場合は書き足すこと。",
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
}
```

### `lib/llm/prompts/generate-preview.ts` も確認

同ファイルに MOM セクションへの言及があれば同様に条件分岐を追加する。
なければ変更不要。

## PROMPT_VERSION の更新

`generate-recap.ts` の `PROMPT_VERSION` を `recap@1.5.0` に更新する。

## 変更するファイル

- `lib/llm/prompts/generate-recap.ts`（構成指示を条件分岐化・`PROMPT_VERSION` を `recap@1.5.0` に更新）
- `lib/llm/prompts/generate-preview.ts`（MOM 言及があれば同様に修正）

## 変更しないこと

- `lib/llm/stages/generate-narrative.ts`
- `lib/llm/stages/assemble.ts`
- `lib/llm/types.ts`

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `projected_lineups.home = []` / `away = []` の状態でプロンプトを組み立てると MOM セクションの指示が含まれないこと
- `PROMPT_VERSION` が `recap@1.5.0` になっていること

## ブランチ・PR

- ブランチ: `fix/mom-skip-guard`
- PR タイトル: `Fix: skip MOM section in recap prompt when lineup data is unavailable`
