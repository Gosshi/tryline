import type { AdditionalSignal, AssembledContentInput, TacticalPoint } from "@/lib/llm/types";

export const PROMPT_VERSION = "preview@1.2.0";

export function buildGeneratePreviewPrompt(
  assembled: AssembledContentInput,
  tacticalPoints: TacticalPoint[],
  additionalSignals: AdditionalSignal[],
): string {
  const signalsBlock =
    additionalSignals.length === 0
      ? ""
      : `外部シグナル(距離を取った帰属表現で利用): ${JSON.stringify(additionalSignals)}`;

  return [
    "あなたは日本語のラグビー専門編集者です。試合プレビューをマークダウンで作成してください。",
    "構成: 1)両チーム現状(400-500字) 2)戦術ポイント展開(600-700字) 3)キープレイヤーと予想(300-400字)。",
    "事実は入力データと一致させること。直接引用は15語以内。",
    "出力は日本語マークダウン本文のみ。",
    "強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
    "選手名・チーム名は英語表記のまま使用すること（カタカナ変換しない）。",
    `試合データ: ${JSON.stringify(assembled)}`,
    `戦術ポイント: ${JSON.stringify(tacticalPoints)}`,
    signalsBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
}
