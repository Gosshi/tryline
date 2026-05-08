# fix-katakana-instruction: カタカナ表記指示の強化

## 背景

`generate-recap.ts` / `generate-preview.ts` の `nameStyleInstruction` が1行・2例のみで弱く、
LLM が馴染みの薄い選手名をアルファベットのまま出力するケースがある。
指示を明示的な禁止表現 + 多様な例に強化する。

## 変更ファイル

### `lib/llm/prompts/generate-recap.ts`

`nameStyleInstruction` の else 節（league-one 以外）を以下に差し替える:

```typescript
: [
    "選手名は必ずカタカナで記載すること。アルファベット表記は禁止。",
    "例: Marcus Smith → マーカス・スミス、Richie Mo'unga → リッチー・モウンガ、",
    "Antoine Dupont → アントワーヌ・デュポン、Siya Kolisi → シヤ・コリシ、",
    "Finn Russell → フィン・ラッセル、Josh van der Flier → ジョシュ・ファン・デル・フリア。",
    "チーム名は英語表記のまま（例: Reds、Leinster、Springboks）。",
  ].join("")
```

`PROMPT_VERSION` を `"recap@1.8.0"` に上げること。

### `lib/llm/prompts/generate-preview.ts`

同じく `nameStyleInstruction` の else 節を同内容に差し替える。

`PROMPT_VERSION` を `"preview@1.7.0"` に上げること。

## 選手名 hallucination 防止（両ファイル共通）

プロンプト配列の「事実は入力データと一致させること。」の行の**直後**に以下を追加する:

```typescript
"選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。",
```

## 完了条件

- `pnpm tsc --noEmit` パス
- `generate-recap.ts` の `PROMPT_VERSION` が `recap@1.8.0`
- `generate-preview.ts` の `PROMPT_VERSION` が `preview@1.7.0`
- else 節にアルファベット禁止の明示と 6 例以上が含まれている

## ブランチ・PR

- ブランチ: `fix/katakana-instruction`
- PR タイトル: `Fix: strengthen katakana name instruction in recap/preview prompts`
