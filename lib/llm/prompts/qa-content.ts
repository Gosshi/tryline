import type { ContentType } from "@/lib/llm/types";

export const PROMPT_VERSION = "qa@1.1.0";

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
