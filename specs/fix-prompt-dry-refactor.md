# LLM プロンプト: preview / recap の共通ブロックを DRY 化する

## 背景

`lib/llm/prompts/generate-preview.ts`（127行）と
`lib/llm/prompts/generate-recap.ts`（146行）に、
以下の完全に同一または僅差のブロックが重複している。

| ブロック | 重複状況 |
|----------|----------|
| `prohibitionsBlock`（禁止表現 8 行） | 完全一致 |
| `persona`（4 文） | 最終行のみ異なる（「プレビューを」vs「レビューを」） |
| `signalsBlock` | 完全一致 |
| `standingsBlock` のロジック | ほぼ同一（結びの文言だけ異なる） |
| `coreQuestionBlock` の構造 | 構造一致、本文のみ異なる |

1 か所で禁止表現を追加・修正しても、もう 1 か所に反映し忘れるリスクが高い。
PR #109 でプロンプトを全面改訂したが、このリスクはそのまま残っている。

## スコープ

対象:
- `lib/llm/prompts/shared-prompt-blocks.ts`（新規作成）— 共通ブロックをエクスポート
- `lib/llm/prompts/generate-preview.ts` — 共通ブロックを import に置き換え
- `lib/llm/prompts/generate-recap.ts` — 共通ブロックを import に置き換え

対象外:
- プロンプトの内容・禁止表現の追加・削除（このリファクタでは変更しない）
- QA プロンプト（`qa-content.ts`）の変更
- `extract-tactical-points.ts` の変更

## データモデル変更

なし

## API サーフェス

なし。`buildGeneratePreviewPrompt` / `buildGenerateRecapPrompt` のシグネチャは変更しない。

## UI サーフェス

なし

## LLM 連携

### `lib/llm/prompts/shared-prompt-blocks.ts`（新規）

```typescript
import type { AdditionalSignal } from "@/lib/llm/types";

export const RUGBY_JOURNALIST_PERSONA_BASE = [
  "あなたは国際ラグビーを20年取材してきたジャーナリストです。",
  "Number やRugby World誌に寄稿し、ファンが試合を深く理解できる",
  "具体的・分析的な日本語文章を書くことを使命としています。",
].join("");

export function buildPersona(contentType: "preview" | "recap"): string {
  const suffix =
    contentType === "preview"
      ? "試合プレビューをマークダウンで作成してください。"
      : "試合レビューをマークダウンで作成してください。";
  return RUGBY_JOURNALIST_PERSONA_BASE + suffix;
}

export const PROHIBITIONS_BLOCK = [
  "【絶対禁止表現 — 1つでも使った場合は書き直すこと】",
  "- 「好調」「好調な」「絶好調」（代わりに「直近5試合で4勝」「平均得点32点」等の数値を使うこと）",
  "- 「重要な一戦」「重要な試合」「重要な局面」",
  "- 「鍵となります」「鍵を握ります」「鍵となるのは」",
  "- 「注目のカード」「注目の一戦」",
  "- 「接戦が予想されます」（代わりに双方の数値差で接戦度を判断すること）",
  "- 「勝利を目指します」「勝利を狙います」（両チームは常に勝とうとしている）",
  "- 「〜でしょうか」で文を終える（読者は答えを期待している）",
].join("\n");

export function buildSignalsBlock(signals: AdditionalSignal[]): string {
  return signals.length === 0
    ? ""
    : `外部シグナル(距離を取った帰属表現で利用): ${JSON.stringify(signals)}`;
}
```

### `generate-preview.ts` / `generate-recap.ts` の変更

```typescript
// 変更前
const persona = [ ... ].join(""); // 重複
const prohibitionsBlock = [ ... ].join("\n"); // 重複

// 変更後
import {
  buildPersona,
  PROHIBITIONS_BLOCK,
  buildSignalsBlock,
} from "./shared-prompt-blocks";
const persona = buildPersona("preview");
const prohibitionsBlock = PROHIBITIONS_BLOCK;
const signalsBlock = buildSignalsBlock(additionalSignals);
```

## 受け入れ条件

1. `shared-prompt-blocks.ts` に共通ブロックが集約されている
2. `generate-preview.ts` と `generate-recap.ts` から重複ブロックが削除されている
3. 両プロンプトの実際の文字列出力がリファクタ前後で変わらない（Jest スナップショットで確認）
4. `tsc --noEmit` でビルドエラーなし

## 未解決の質問

- `standingsBlock` の結びの文言（「プレビューに組み込むこと」vs「レビューに組み込むこと」）を
  パラメータ化するか、個別ファイルに残すかは Codex が判断すること