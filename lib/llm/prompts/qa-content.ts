import type { ContentType } from "@/lib/llm/types";

export const PROMPT_VERSION = "qa@1.0.0";

export function buildQaContentPrompt(contentType: ContentType, narrative: string): string {
  return [
    "あなたは編集デスクです。以下の日本語コンテンツを品質評価してください。",
    `content_type: ${contentType}`,
    "JSONのみで返答。スキーマ: {\"scores\":{\"information_density\":1-5,\"japanese_quality\":1-5,\"factual_grounding\":1-5},\"issues\":string[],\"verdict\":\"publish\"|\"retry\"|\"reject\"}",
    "いずれか2以下なら verdict は retry。全て3以上なら publish。重大欠陥で再試行価値がなければ reject。",
    `本文: ${narrative}`,
  ].join("\n\n");
}
