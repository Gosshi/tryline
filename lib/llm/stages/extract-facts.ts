import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";
import { buildExtractTacticalPointsPrompt, PROMPT_VERSION } from "@/lib/llm/prompts/extract-tactical-points";

import type { AssembledContentInput, FactExtractionResult } from "@/lib/llm/types";

export type FactExtractionResponse = {
  result: FactExtractionResult;
  modelVersion: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  attempts: number;
};

function parseFactExtraction(jsonText: string): FactExtractionResult {
  const parsed = JSON.parse(jsonText) as FactExtractionResult;

  if (!Array.isArray(parsed.tactical_points) || parsed.tactical_points.length !== 3) {
    throw new Error("extract-facts must return exactly 3 tactical points");
  }

  return parsed;
}

export async function extractTacticalPoints(input: AssembledContentInput): Promise<FactExtractionResponse> {
  const prompt = buildExtractTacticalPointsPrompt(input);
  let attempts = 0;

  while (attempts < 2) {
    attempts += 1;

    const response = await createTextResponse({
      model: MODELS.FAST,
      input: prompt,
      temperature: 0.2,
      jsonMode: true,
    });

    try {
      const result = parseFactExtraction(response.text);

      return {
        result,
        modelVersion: response.model,
        promptVersion: PROMPT_VERSION,
        usage: response.usage,
        attempts,
      };
    } catch (error) {
      if (attempts >= 2) {
        throw error;
      }
    }
  }

  throw new Error("unreachable");
}
