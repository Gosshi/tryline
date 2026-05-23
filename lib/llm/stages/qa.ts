import { MODELS } from "@/lib/llm/models";
import { createTextResponse } from "@/lib/llm/openai";
import {
  buildQaContentPrompt,
  PROMPT_VERSION,
  type QaMatchContext,
} from "@/lib/llm/prompts/qa-content";

import type {
  ContentLanguage,
  ContentType,
  QaResult,
  QaVerdict,
} from "@/lib/llm/types";

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

type ParsedQaResponse = {
  scores?: QaResult["scores"];
  issues?: unknown;
};

// Single source of truth for QA verdicts. The LLM scores content only; code
// applies the stable retry/reject thresholds used by the pipeline.
function resolveVerdict(
  scores: QaResult["scores"],
  retryCount: number,
): QaVerdict {
  if (scores.tactical_depth <= 2) {
    if (retryCount >= 2) {
      return "reject";
    }

    return "retry";
  }

  const scoreValues = [
    scores.information_density,
    scores.japanese_quality,
    scores.factual_grounding,
    scores.tactical_depth,
  ];

  if (scoreValues.every((score) => score >= 3)) {
    return "publish";
  }

  if (retryCount >= 2) {
    return "reject";
  }

  return "retry";
}

function applyDeterministicQaGuards(
  result: QaResult,
  options: {
    contentType: ContentType;
    hasEvents: boolean;
    narrative: string;
  },
): QaResult {
  if (
    options.contentType !== "recap" ||
    !options.hasEvents ||
    options.narrative.includes("# ターニングポイント")
  ) {
    return result;
  }

  const issue = "ターニングポイントセクションが欠落しています";
  return {
    ...result,
    issues: result.issues.includes(issue)
      ? result.issues
      : [...result.issues, issue],
    scores: {
      ...result.scores,
      information_density: Math.min(result.scores.information_density, 3),
    },
  };
}

function parseQaResponse(
  jsonText: string,
  retryCount: number,
  options: {
    contentType: ContentType;
    hasEvents: boolean;
    narrative: string;
  },
): QaResult {
  const parsed = JSON.parse(jsonText) as ParsedQaResponse;

  if (!parsed.scores) {
    throw new Error("qa response missing scores");
  }

  const guarded = applyDeterministicQaGuards(
    {
      scores: parsed.scores,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      verdict: "retry",
    },
    options,
  );

  return {
    ...guarded,
    verdict: resolveVerdict(guarded.scores, retryCount),
  };
}

export async function evaluateNarrativeQuality(options: {
  contentType: ContentType;
  hasEvents?: boolean;
  language?: ContentLanguage;
  matchContext: QaMatchContext;
  narrative: string;
  retryCount: number;
}): Promise<QaStageResponse> {
  const hasEvents = options.hasEvents ?? false;
  const prompt = buildQaContentPrompt(
    options.contentType,
    options.narrative,
    options.language ?? "ja",
    options.matchContext,
    hasEvents,
  );
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
      const result = parseQaResponse(response.text, options.retryCount, {
        contentType: options.contentType,
        hasEvents,
        narrative: options.narrative,
      });

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