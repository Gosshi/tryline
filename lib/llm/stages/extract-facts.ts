import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";
import {
  buildExtractTacticalPointsPrompt,
  PROMPT_VERSION,
} from "@/lib/llm/prompts/extract-tactical-points";

import type {
  AssembledContentInput,
  FactExtractionResult,
} from "@/lib/llm/types";

const MAX_EVENTS = 40;
const MAX_STANDINGS_TEAMS = 10;
const APPROX_TOKEN_WARNING_THRESHOLD = 20_000;

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
  const pointCount = Array.isArray(parsed.tactical_points)
    ? parsed.tactical_points.length
    : 0;

  if (pointCount < 2 || pointCount > 5) {
    throw new Error("extract-facts must return 2 to 5 tactical points");
  }

  return parsed;
}

function trimAssembledInput(
  input: AssembledContentInput,
): AssembledContentInput {
  return {
    ...input,
    competition_standings: input.competition_standings.slice(
      0,
      MAX_STANDINGS_TEAMS,
    ),
    match_events: input.match_events.slice(0, MAX_EVENTS),
  };
}

function warnIfPromptInputIsLarge(input: AssembledContentInput): void {
  const approximateTokens = JSON.stringify(input).length / 4;

  if (approximateTokens > APPROX_TOKEN_WARNING_THRESHOLD) {
    console.warn(
      `extract-facts prompt input is approximately ${Math.round(approximateTokens)} tokens after trimming`,
    );
  }
}

export async function extractTacticalPoints(
  input: AssembledContentInput,
): Promise<FactExtractionResponse> {
  const trimmedInput = trimAssembledInput(input);
  warnIfPromptInputIsLarge(trimmedInput);

  const prompt = buildExtractTacticalPointsPrompt(trimmedInput);
  let attempts = 0;

  while (attempts < 2) {
    attempts += 1;

    const response = await createTextResponse({
      model: MODELS.FAST,
      input: prompt,
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
