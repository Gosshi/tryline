import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { notifyContentRejected } from "@/lib/llm/notify";
import { calculateCostUsd } from "@/lib/llm/pricing";
import { assembleMatchContentInput } from "@/lib/llm/stages/assemble";
import { extractTacticalPoints } from "@/lib/llm/stages/extract-facts";
import { generateNarrative, NARRATIVE_TEMPERATURE_SEQUENCE } from "@/lib/llm/stages/generate-narrative";
import { evaluateNarrativeQuality } from "@/lib/llm/stages/qa";

import type { Json } from "@/lib/db/types";
import type { ContentType, QaResult } from "@/lib/llm/types";

export type PipelineResult = {
  matchId: string;
  contentType: ContentType;
  status: "published" | "draft";
  qa: QaResult;
};

function hashInput(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function logPipelineRun(entry: {
  matchId: string;
  contentType: ContentType;
  stage: number;
  inputHash?: string;
  output?: Json;
  costUsd?: number;
  durationMs: number;
  status: "success" | "retry" | "failed";
  errorMessage?: string;
}) {
  const db = getSupabaseServerClient();

  const { error } = await db.from("pipeline_runs").insert({
    match_id: entry.matchId,
    content_type: entry.contentType,
    stage: entry.stage,
    input_hash: entry.inputHash,
    output: entry.output,
    cost_usd: entry.costUsd,
    duration_ms: entry.durationMs,
    status: entry.status,
    error_message: entry.errorMessage,
  });

  if (error) {
    console.error("[content-pipeline] failed to log pipeline run", error);
  }
}

export async function generateMatchContent(matchId: string, contentType: ContentType): Promise<PipelineResult> {
  const db = getSupabaseServerClient();

  const stage1StartedAt = Date.now();
  const assembled = await assembleMatchContentInput(matchId);
  await logPipelineRun({
    matchId,
    contentType,
    stage: 1,
    inputHash: hashInput({ matchId }),
    output: assembled,
    costUsd: 0,
    durationMs: Date.now() - stage1StartedAt,
    status: "success",
  });

  const stage2StartedAt = Date.now();
  let tactical;
  try {
    tactical = await extractTacticalPoints(assembled);
  } catch (error) {
    await logPipelineRun({
      matchId,
      contentType,
      stage: 2,
      inputHash: hashInput(assembled),
      durationMs: Date.now() - stage2StartedAt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "extract failed",
    });
    throw error;
  }

  await logPipelineRun({
    matchId,
    contentType,
    stage: 2,
    inputHash: hashInput(assembled),
    output: tactical.result,
    costUsd: calculateCostUsd({
      modelVersion: tactical.modelVersion,
      inputTokens: tactical.usage.inputTokens,
      outputTokens: tactical.usage.outputTokens,
    }),
    durationMs: Date.now() - stage2StartedAt,
    status: "success",
  });

  let finalQa: QaResult | null = null;
  let finalNarrative = "";
  let modelVersion = "";
  let promptVersion = "";

  for (let attempt = 0; attempt < NARRATIVE_TEMPERATURE_SEQUENCE.length; attempt += 1) {
    const stage3StartedAt = Date.now();
    const narrative = await generateNarrative({
      assembled,
      tacticalPoints: tactical.result.tactical_points,
      contentType,
      additionalSignals: [],
      attempt,
    });

    finalNarrative = narrative.content;
    modelVersion = narrative.modelVersion;
    promptVersion = narrative.promptVersion;

    await logPipelineRun({
      matchId,
      contentType,
      stage: 3,
      inputHash: hashInput({ assembled, tactical: tactical.result, additionalSignals: [] }),
      output: {
        temperature: narrative.temperature,
        content: narrative.content,
      },
      costUsd: calculateCostUsd({
        modelVersion: narrative.modelVersion,
        inputTokens: narrative.usage.inputTokens,
        outputTokens: narrative.usage.outputTokens,
      }),
      durationMs: Date.now() - stage3StartedAt,
      status: "success",
    });

    const stage4StartedAt = Date.now();
    let qaResponse;

    try {
      qaResponse = await evaluateNarrativeQuality({
        contentType,
        narrative: narrative.content,
        retryCount: attempt,
      });
    } catch (error) {
      await logPipelineRun({
        matchId,
        contentType,
        stage: 4,
        inputHash: hashInput({ narrative: narrative.content }),
        output: {
          narrative,
        },
        durationMs: Date.now() - stage4StartedAt,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "qa failed",
      });

      finalQa = {
        scores: {
          information_density: 1,
          japanese_quality: 1,
          factual_grounding: 1,
        },
        issues: ["qa_json_parse_failed"],
        verdict: "reject",
      };

      break;
    }

    finalQa = qaResponse.result;

    await logPipelineRun({
      matchId,
      contentType,
      stage: 4,
      inputHash: hashInput({ narrative: narrative.content }),
      output: qaResponse.result,
      costUsd: calculateCostUsd({
        modelVersion: qaResponse.modelVersion,
        inputTokens: qaResponse.usage.inputTokens,
        outputTokens: qaResponse.usage.outputTokens,
      }),
      durationMs: Date.now() - stage4StartedAt,
      status: qaResponse.result.verdict === "retry" ? "retry" : "success",
    });

    if (qaResponse.result.verdict === "publish") {
      break;
    }

    if (qaResponse.result.verdict === "reject") {
      break;
    }
  }

  if (!finalQa) {
    throw new Error("pipeline failed to produce qa result");
  }

  const persistedStatus = finalQa.verdict === "publish" ? "published" : "draft";

  const { error: upsertError } = await db.from("match_content").upsert(
    {
      match_id: matchId,
      content_type: contentType,
      content_md_ja: finalNarrative,
      model_version: modelVersion,
      prompt_version: promptVersion,
      status: persistedStatus,
      qa_scores: finalQa,
      generated_at: new Date().toISOString(),
    },
    {
      onConflict: "match_id,content_type",
    },
  );

  if (upsertError) {
    throw upsertError;
  }

  if (persistedStatus === "draft") {
    await notifyContentRejected(matchId, contentType);
  }

  return {
    matchId,
    contentType,
    status: persistedStatus,
    qa: finalQa,
  };
}
