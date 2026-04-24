import type { AssembledContentInput } from "@/lib/llm/types";

export const PROMPT_VERSION = "extract@1.0.0";

export function buildExtractTacticalPointsPrompt(input: AssembledContentInput): string {
  return [
    "あなたはラグビー戦術アナリストです。入力データだけを根拠に、具体的な戦術ポイントを3つ抽出してください。",
    "出力はJSONのみ。スキーマ: {\"tactical_points\":[{\"point\":string,\"detail\":string,\"evidence\":string[]}]}。",
    "detail は日本語120字程度。一般論は禁止。各ポイントは数値または試合実績に言及すること。",
    "直接引用は15語以内。原文を長く転記せず言い換えること。",
    `入力JSON: ${JSON.stringify(input)}`,
  ].join("\n\n");
}
