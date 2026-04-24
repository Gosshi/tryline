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

import type { AdditionalSignal, AssembledContentInput, ContentType, TacticalPoint } from "@/lib/llm/types";

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
}): Promise<NarrativeResponse> {
  const temperature = NARRATIVE_TEMPERATURE_SEQUENCE[options.attempt] ?? NARRATIVE_TEMPERATURE_SEQUENCE[0];
  const isPreview = options.contentType === "preview";
  const prompt = isPreview
    ? buildGeneratePreviewPrompt(options.assembled, options.tacticalPoints, options.additionalSignals)
    : buildGenerateRecapPrompt(options.assembled, options.tacticalPoints, options.additionalSignals);

  const response = await createTextResponse({
    model: MODELS.NARRATIVE,
    input: prompt,
    temperature,
  });

  return {
    content: response.text,
    modelVersion: response.model,
    promptVersion: isPreview ? PREVIEW_PROMPT_VERSION : RECAP_PROMPT_VERSION,
    usage: response.usage,
    temperature,
  };
}
