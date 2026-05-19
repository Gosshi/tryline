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
  const temperature = NARRATIVE_TEMPERATURE_SEQUENCE[options.attempt] ?? NARRATIVE_TEMPERATURE_SEQUENCE[0];
  const isPreview = options.contentType === "preview";
  const basePromptVersion = isPreview
    ? PREVIEW_PROMPT_VERSION
    : RECAP_PROMPT_VERSION;
  const language = options.language ?? "ja";
  const prompt =
    language === "en"
      ? buildEnglishNarrativePrompt(options)
      : isPreview
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

  const response = await createTextResponse({
    model: MODELS.NARRATIVE,
    input: prompt,
    temperature,
  });

  return {
    content: response.text,
    modelVersion: response.model,
    promptVersion:
      language === "en" ? `${basePromptVersion}-en` : basePromptVersion,
    usage: response.usage,
    temperature,
  };
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
        "Use this structure:",
        "1) Team context and stakes",
        "2) Tactical themes and likely pressure points",
        hasLineups
          ? "3) Key players and match prediction"
          : "3) Match outlook based on recent form, standings, and head-to-head data",
      ].join("\n")
    : [
        "Use this structure:",
        "1) Match overview",
        hasEvents
          ? "2) Turning points based only on the listed scoring events"
          : "2) Competition context and table impact",
        hasLineups
          ? "3) Player impact and player of the match reasoning"
          : "3) Team trends and tactical implications",
        "4) What it means next",
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
    "Write in fluent English Markdown for international rugby fans who want clear tactical analysis.",
    structure,
    "Use headings (#) and bullet lists (-) only. Do not use bold, italics, blockquotes, or code fences.",
    "Keep facts consistent with the input data. Do not invent player names or events.",
    "If player lineups or events are missing, focus on team tactics, recent form, standings, head-to-head history, and match context.",
    "Direct quotations must be 15 words or fewer.",
    "For League One team and player names, use the names supplied in the input data as-is unless a common English rugby name is already present.",
    "The home_score and away_score fields are the authoritative final score when present. The higher score is the winner.",
    eventsInstruction,
    sparseInstruction,
    `Match data: ${JSON.stringify(options.assembled)}`,
    `Tactical points: ${JSON.stringify(options.tacticalPoints)}`,
    signalsBlock,
    "Return only the English Markdown body.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
