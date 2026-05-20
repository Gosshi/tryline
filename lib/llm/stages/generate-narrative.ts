import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";
import {
  buildGeneratePreviewPrompt,
  PROMPT_VERSION as PREVIEW_PROMPT_VERSION,
} from "@/lib/llm/prompts/generate-preview";
import {
  buildGenerateRecapPrompt,
  PROMPT_VERSION as RECAP_PROMPT_VERSION,
} from "@/lib/llm/prompts/generate-recap";

import type {
  AdditionalSignal,
  AssembledContentInput,
  ContentLanguage,
  ContentType,
  TacticalPoint,
} from "@/lib/llm/types";

export const NARRATIVE_TEMPERATURE_SEQUENCE = [0.7, 0.9, 0.4] as const;
const ENGLISH_PREVIEW_PROMPT_VERSION = "preview@2.0.0-en";
const ENGLISH_RECAP_PROMPT_VERSION = "recap@2.2.0-en";

export type NarrativeResponse = {
  content: string;
  modelVersion: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  temperature: number;
};

export async function generateNarrative(options: {
  assembled: AssembledContentInput;
  tacticalPoints: TacticalPoint[];
  contentType: ContentType;
  additionalSignals: AdditionalSignal[];
  attempt: number;
  language?: ContentLanguage;
}): Promise<NarrativeResponse> {
  const temperature =
    NARRATIVE_TEMPERATURE_SEQUENCE[options.attempt] ??
    NARRATIVE_TEMPERATURE_SEQUENCE[0];
  const isPreview = options.contentType === "preview";
  const basePromptVersion = isPreview
    ? PREVIEW_PROMPT_VERSION
    : RECAP_PROMPT_VERSION;
  const language = options.language ?? "ja";
  const prompt =
    language === "en"
      ? buildEnglishNarrativePrompt(options)
      : buildJapaneseNarrativePrompt(options);

  const response = await createTextResponse({
    model: MODELS.NARRATIVE,
    input: prompt,
    temperature,
  });

  return {
    content: response.text,
    modelVersion: response.model,
    promptVersion:
      language === "en"
        ? isPreview
          ? ENGLISH_PREVIEW_PROMPT_VERSION
          : ENGLISH_RECAP_PROMPT_VERSION
        : basePromptVersion,
    usage: response.usage,
    temperature,
  };
}

function buildJapaneseNarrativePrompt(options: {
  assembled: AssembledContentInput;
  tacticalPoints: TacticalPoint[];
  contentType: ContentType;
  additionalSignals: AdditionalSignal[];
}) {
  const basePrompt =
    options.contentType === "preview"
      ? buildGeneratePreviewPrompt(
          options.assembled,
          options.tacticalPoints,
          options.additionalSignals,
        )
      : buildGenerateRecapPrompt(
          options.assembled,
          options.tacticalPoints,
          options.additionalSignals,
        );
  const firstSectionInstruction =
    options.contentType === "preview"
      ? [
          "【重要】第1セクション（見どころ要約）は 250〜350 字で完結させること。",
          "このセクションは無料公開エリアになる。",
          "試合の見どころ、両チームの状態、最大の注目点を簡潔にまとめる。",
        ].join("\n")
      : [
          "【重要】第1セクション（試合概要）は 250〜350 字で完結させること。",
          "このセクションは無料公開エリアになる。",
          "試合の結論（勝敗・スコア・最大のポイント）を簡潔にまとめる。",
        ].join("\n");

  return [firstSectionInstruction, basePrompt].join("\n\n");
}

function buildEnglishNarrativePrompt(options: {
  assembled: AssembledContentInput;
  tacticalPoints: TacticalPoint[];
  contentType: ContentType;
  additionalSignals: AdditionalSignal[];
}) {
  const hasEvents = options.assembled.match_events.length > 0;
  const hasLineups =
    options.assembled.projected_lineups.home.length > 0 ||
    options.assembled.projected_lineups.away.length > 0;
  const isPreview = options.contentType === "preview";
  const contentLabel = isPreview ? "match preview" : "match recap";
  const structure = isPreview
    ? [
        "Structure for preview:",
        "1) Team Context and Form - 300-400 words. Current table position, recent results from recent_form, momentum.",
        "2) Tactical Themes - 400-500 words. Expected patterns of play, key positional battles, pressure points.",
        "3) Key Players and Prediction - 200-300 words. If lineups present, name key individuals. Otherwise focus on likely patterns based on form and head-to-head data.",
        "Target: 1,000+ words total.",
      ].join("\n")
    : [
        "Structure for recap:",
        "1) Match Overview - 300-400 words. Final score, flow of the match, decisive factor.",
        "2) Turning Points - 350-450 words. Based ONLY on the match_events data. Walk through scoring events in order and explain momentum shifts.",
        "3) Player of the Match - 200-300 words. Identify the standout performer with specific evidence from events. Omit this section if lineup data is missing.",
        "4) What It Means Next - 200-300 words. Table implications, next fixture context, form trajectory for both teams.",
        "Target: 1,200+ words total.",
      ].join("\n");
  const eventsInstruction =
    !isPreview && hasEvents
      ? `Scoring events must be based only on this data: ${JSON.stringify(options.assembled.match_events)}`
      : "";
  const sparseInstruction =
    !hasEvents && !hasLineups
      ? [
          "Data-sparse mode: do not invent players, scorers, injuries, or play-by-play detail.",
          "Use recent_form, competition_standings, h2h_last_5, key_stats, and the final score where available.",
        ].join("\n")
      : "";
  const signalsBlock =
    options.additionalSignals.length === 0
      ? ""
      : `Additional signals, if useful with careful attribution: ${JSON.stringify(options.additionalSignals)}`;

  return [
    `You are a rugby journalist. Write a detailed ${contentLabel} in English.`,
    [
      "HARD RULES - follow without exception:",
      "- Never use bold markers (**text** or __text__). Not in headings, not in bullet points. Nowhere.",
      "- Never use Japanese characters (hiragana, katakana, kanji). The output must be entirely in English.",
      "- Do not invent player names, events, or details not present in the input data.",
    ].join("\n"),
    "Write in fluent English Markdown for international rugby fans who want clear tactical analysis.",
    structure,
    "Use headings (#) and bullet lists (-) only. Do not use bold, italics, blockquotes, or code fences.",
    "Player names in the input may be in Japanese katakana. Convert them to their standard romanized English form using common rugby name conventions.",
    "Examples: チェスリン・コルビ -> Cheslin Kolbe, 流大 -> Yutaka Nagare, ケイレブ・トラスク -> Caleb Trask.",
    "If uncertain, produce a reasonable romanization rather than leaving any Japanese characters in the output.",
    "Keep facts consistent with the input data. Do not invent player names or events.",
    "If player lineups or events are missing, focus on team tactics, recent form, standings, head-to-head history, and match context.",
    "Direct quotations must be 15 words or fewer.",
    "The home_score and away_score fields are the authoritative final score when present. The higher score is the winner.",
    eventsInstruction,
    !isPreview && !hasLineups
      ? "For recaps without lineup data, omit the Player of the Match section rather than inventing a standout player."
      : "",
    sparseInstruction,
    `Match data: ${JSON.stringify(options.assembled)}`,
    `Tactical points: ${JSON.stringify(options.tacticalPoints)}`,
    signalsBlock,
    "Return only the English Markdown body.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
