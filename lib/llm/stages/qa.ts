import {
  containsUnsupportedStatistic,
  UNSUPPORTED_STATISTIC_ISSUE,
} from "@/lib/content/fabrication-guard";
import {
  CONTENT_LENGTH_ISSUE,
  getContentLengthRequirement,
  measureContentLength,
} from "@/lib/llm/content-length";
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

function appendIssue(issues: string[], issue: string): string[] {
  return issues.includes(issue) ? issues : [...issues, issue];
}

export function isContentLengthIssue(result: QaResult): boolean {
  return result.issues.includes(CONTENT_LENGTH_ISSUE);
}

export function isFactualGroundingHardBlock(result: QaResult): boolean {
  return (
    result.scores.factual_grounding <= 2 ||
    result.issues.includes(UNSUPPORTED_STATISTIC_ISSUE)
  );
}

// Single source of truth for QA verdicts. The LLM scores content only; code
// applies the stable retry/reject thresholds used by the pipeline.
function resolveVerdict(
  scores: QaResult["scores"],
  retryCount: number,
  factualHardBlock: boolean,
  lengthUnderMinimum: boolean,
): QaVerdict {
  if (factualHardBlock) {
    if (retryCount >= 2) {
      return "reject";
    }

    return "retry";
  }

  if (lengthUnderMinimum) {
    return "retry";
  }

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
    language: ContentLanguage;
    matchContext: QaMatchContext;
    narrative: string;
  },
): QaResult {
  let guarded = result;

  if (
    containsUnsupportedStatistic(
      options.narrative,
      options.matchContext.sourcedFacts?.map((fact) => fact.fact) ?? [],
    )
  ) {
    guarded = {
      ...guarded,
      issues: appendIssue(guarded.issues, UNSUPPORTED_STATISTIC_ISSUE),
      scores: {
        ...guarded.scores,
        factual_grounding: 1,
      },
    };
  }

  const lengthRequirement = getContentLengthRequirement(
    options.contentType,
    options.language,
  );
  if (
    measureContentLength(options.narrative, lengthRequirement) <
    lengthRequirement.min
  ) {
    guarded = {
      ...guarded,
      issues: appendIssue(guarded.issues, CONTENT_LENGTH_ISSUE),
      scores: {
        ...guarded.scores,
        information_density: Math.min(guarded.scores.information_density, 2),
      },
    };
  }

  if (
    options.contentType !== "recap" ||
    !options.hasEvents ||
    options.narrative.includes("# ターニングポイント")
  ) {
    return guarded;
  }

  const issue = "ターニングポイントセクションが欠落しています";
  return {
    ...guarded,
    issues: appendIssue(guarded.issues, issue),
    scores: {
      ...guarded.scores,
      information_density: Math.min(guarded.scores.information_density, 3),
    },
  };
}

function parseQaResponse(
  jsonText: string,
  retryCount: number,
  options: {
    contentType: ContentType;
    hasEvents: boolean;
    language: ContentLanguage;
    matchContext: QaMatchContext;
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
  const lengthUnderMinimum = isContentLengthIssue(guarded);
  const factualHardBlock = isFactualGroundingHardBlock(guarded);

  return {
    ...guarded,
    verdict: resolveVerdict(
      guarded.scores,
      retryCount,
      factualHardBlock,
      lengthUnderMinimum,
    ),
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
        language: options.language ?? "ja",
        matchContext: options.matchContext,
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
