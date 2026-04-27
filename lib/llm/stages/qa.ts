import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";
import { buildQaContentPrompt, PROMPT_VERSION } from "@/lib/llm/prompts/qa-content";

import type { ContentType, QaResult, QaVerdict } from "@/lib/llm/types";

export type QaStageResponse = {
  result: QaResult;
  modelVersion: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  attempts: number;
};

function resolveVerdict(scores: QaResult["scores"], retryCount: number): QaVerdict {
  const scoreValues = [scores.information_density, scores.japanese_quality, scores.factual_grounding];

  if (scoreValues.every((score) => score >= 3)) {
    return "publish";
  }

  if (retryCount >= 2) {
    return "reject";
  }

  return "retry";
}

function parseQaResponse(jsonText: string, retryCount: number): QaResult {
  const parsed = JSON.parse(jsonText) as QaResult;

  if (!parsed.scores) {
    throw new Error("qa response missing scores");
  }

  return {
    scores: parsed.scores,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    verdict: resolveVerdict(parsed.scores, retryCount),
  };
}

export async function evaluateNarrativeQuality(options: {
  contentType: ContentType;
  narrative: string;
  retryCount: number;
}): Promise<QaStageResponse> {
  const prompt = buildQaContentPrompt(options.contentType, options.narrative);
  let attempts = 0;

  while (attempts < 2) {
    attempts += 1;

    const response = await createTextResponse({
      model: MODELS.FAST,
      input: prompt,
      temperature: 0,
      jsonMode: true,
    });

    try {
      const result = parseQaResponse(response.text, options.retryCount);

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
