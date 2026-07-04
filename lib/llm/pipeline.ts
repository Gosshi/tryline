import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { hasConfirmedProjectedLineups } from "@/lib/llm/lineups";
import { notifyContentRejected, notifyCostAlert } from "@/lib/llm/notify";
import { calculateCostUsd } from "@/lib/llm/pricing";
import {
  assembleMatchContentInput,
  computeScoreTimeline,
} from "@/lib/llm/stages/assemble";
import { extractTacticalPoints } from "@/lib/llm/stages/extract-facts";
import {
  generateNarrative,
  NARRATIVE_TEMPERATURE_SEQUENCE,
  reviseNarrativeLength,
} from "@/lib/llm/stages/generate-narrative";
import {
  DENSITY_PUBLISH_MIN,
  evaluateNarrativeQuality,
  isContentLengthIssue,
  isFactualGroundingHardBlock,
} from "@/lib/llm/stages/qa";
import { submitUrlsToIndexNow } from "@/lib/seo/indexnow";
import { SITE_URL } from "@/lib/site";

import type { Json } from "@/lib/db/types";
import type { ContentLanguage, ContentType, QaResult } from "@/lib/llm/types";

const COST_ALERT_THRESHOLD_USD = 0.2;
const MAX_LENGTH_REVISION_ATTEMPTS = 1;
const LENGTH_REVISION_FALLBACK_ISSUE =
  "字数下限未達のまま加筆リトライ上限に到達しました";
const FACTUAL_REVISION_FALLBACK_ISSUE =
  "加筆リトライで事実根拠が低下したため短い正確な版を採用しました";

export type PipelineResult = {
  matchId: string;
  contentType: ContentType;
  status: "published" | "draft" | "skipped";
  qa: QaResult | null;
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

export async function generateMatchContent(
  matchId: string,
  contentType: ContentType,
  language: ContentLanguage = "ja",
): Promise<PipelineResult> {
  const db = getSupabaseServerClient();

  const stage1StartedAt = Date.now();
  const assembled = await assembleMatchContentInput(
    matchId,
    language,
    contentType,
  );
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

  if (contentType === "recap" && assembled.match_events.length > 0) {
    const timeline = computeScoreTimeline(
      assembled.match_events,
      assembled.match.home_team?.name ?? "Home",
      assembled.match.away_team?.name ?? "Away",
    );

    if (timeline) {
      const homeDelta =
        timeline.final_home - (assembled.match.home_score ?? 0);
      const awayDelta =
        timeline.final_away - (assembled.match.away_score ?? 0);

      if (homeDelta !== 0 || awayDelta !== 0) {
        console.warn("[score-integrity] event total mismatch", {
          awayDelta,
          homeDelta,
          matchId,
        });

        await logPipelineRun({
          matchId,
          contentType,
          stage: 0,
          inputHash: "",
          output: { awayDelta, homeDelta, type: "score_event_mismatch" },
          costUsd: 0,
          durationMs: 0,
          status: "failed",
        });
      }
    }
  }

  if (contentType === "recap" && assembled.match_events.length === 0) {
    return {
      matchId,
      contentType,
      status: "skipped",
      qa: null,
    };
  }

  const hasEvents = assembled.match_events.length > 0;
  const hasLineups = hasConfirmedProjectedLineups(assembled.projected_lineups);
  let totalCostUsd = 0;

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

  const stage2CostUsd = calculateCostUsd({
    modelVersion: tactical.modelVersion,
    inputTokens: tactical.usage.inputTokens,
    outputTokens: tactical.usage.outputTokens,
  });
  totalCostUsd += stage2CostUsd;

  await logPipelineRun({
    matchId,
    contentType,
    stage: 2,
    inputHash: hashInput(assembled),
    output: tactical.result,
    costUsd: stage2CostUsd,
    durationMs: Date.now() - stage2StartedAt,
    status: "success",
  });

  let finalQa: QaResult | null = null;
  let finalNarrative = "";
  let modelVersion = "";
  let promptVersion = "";
  let lengthRevisionAttempts = 0;

  for (
    let attempt = 0;
    attempt < NARRATIVE_TEMPERATURE_SEQUENCE.length;
    attempt += 1
  ) {
    const stage3StartedAt = Date.now();
    const narrative = await generateNarrative({
      assembled,
      tacticalPoints: tactical.result.tactical_points,
      contentType,
      // TODO(D009): Reddit/SNS シグナルが実装されたらここに渡す。現在は常に空配列。
      additionalSignals: [],
      attempt,
      language,
    });

    finalNarrative = narrative.content;
    modelVersion = narrative.modelVersion;
    promptVersion = narrative.promptVersion;

    const stage3CostUsd = calculateCostUsd({
      modelVersion: narrative.modelVersion,
      inputTokens: narrative.usage.inputTokens,
      outputTokens: narrative.usage.outputTokens,
    });
    totalCostUsd += stage3CostUsd;

    await logPipelineRun({
      matchId,
      contentType,
      stage: 3,
      inputHash: hashInput({
        assembled,
        tactical: tactical.result,
        // TODO(D009): Reddit/SNS シグナルが実装されたらここに渡す。現在は常に空配列。
        additionalSignals: [],
      }),
      output: {
        temperature: narrative.temperature,
        content: narrative.content,
      },
      costUsd: stage3CostUsd,
      durationMs: Date.now() - stage3StartedAt,
      status: "success",
    });

    const stage4StartedAt = Date.now();
    let qaResponse;

    try {
      qaResponse = await evaluateNarrativeQuality({
        contentType,
        language,
        matchContext: {
          awayScore: assembled.match.away_score,
          awayTeam: assembled.match.away_team?.name ?? "Away",
          derivedStats: assembled.derived_stats,
          homeScore: assembled.match.home_score,
          homeTeam: assembled.match.home_team?.name ?? "Home",
          sourcedFacts: assembled.sourced_facts,
        },
        hasEvents,
        hasLineups,
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
          tactical_depth: 1,
        },
        issues: ["qa_json_parse_failed"],
        verdict: "reject",
      };

      break;
    }

    finalQa = qaResponse.result;

    const stage4CostUsd = calculateCostUsd({
      modelVersion: qaResponse.modelVersion,
      inputTokens: qaResponse.usage.inputTokens,
      outputTokens: qaResponse.usage.outputTokens,
    });
    totalCostUsd += stage4CostUsd;

    await logPipelineRun({
      matchId,
      contentType,
      stage: 4,
      inputHash: hashInput({ narrative: narrative.content }),
      output: qaResponse.result,
      costUsd: stage4CostUsd,
      durationMs: Date.now() - stage4StartedAt,
      status: qaResponse.result.verdict === "retry" ? "retry" : "success",
    });

    if (qaResponse.result.verdict === "publish") {
      break;
    }

    if (
      language === "ja" &&
      qaResponse.result.verdict === "retry" &&
      isContentLengthIssue(qaResponse.result) &&
      !isFactualGroundingHardBlock(qaResponse.result) &&
      lengthRevisionAttempts < MAX_LENGTH_REVISION_ATTEMPTS
    ) {
      const baselineNarrative = finalNarrative;
      const baselineModelVersion = modelVersion;
      const baselinePromptVersion = promptVersion;
      const baselineQa = qaResponse.result;
      lengthRevisionAttempts += 1;
      const revisionStartedAt = Date.now();
      const revised = await reviseNarrativeLength({
        additionalSignals: [],
        assembled,
        contentType,
        currentContent: finalNarrative,
        language,
        promptVersion,
        tacticalPoints: tactical.result.tactical_points,
      });

      finalNarrative = revised.content;
      modelVersion = revised.modelVersion;
      promptVersion = revised.promptVersion;

      const revisionCostUsd = calculateCostUsd({
        modelVersion: revised.modelVersion,
        inputTokens: revised.usage.inputTokens,
        outputTokens: revised.usage.outputTokens,
      });
      totalCostUsd += revisionCostUsd;

      await logPipelineRun({
        matchId,
        contentType,
        stage: 3,
        inputHash: hashInput({
          assembled,
          contentType,
          currentContent: narrative.content,
          reason: "content_length_under_minimum",
          tactical: tactical.result,
        }),
        output: {
          content: revised.content,
          lengthRevisionAttempts,
          reason: "content_length_under_minimum",
          temperature: revised.temperature,
        },
        costUsd: revisionCostUsd,
        durationMs: Date.now() - revisionStartedAt,
        status: "retry",
      });

      const revisionQaStartedAt = Date.now();
      const revisionQaResponse = await evaluateNarrativeQuality({
        contentType,
        language,
        matchContext: {
          awayScore: assembled.match.away_score,
          awayTeam: assembled.match.away_team?.name ?? "Away",
          derivedStats: assembled.derived_stats,
          homeScore: assembled.match.home_score,
          homeTeam: assembled.match.home_team?.name ?? "Home",
          sourcedFacts: assembled.sourced_facts,
        },
        hasEvents,
        hasLineups,
        narrative: revised.content,
        retryCount: attempt + 1,
      });
      finalQa = revisionQaResponse.result;

      const revisionQaCostUsd = calculateCostUsd({
        modelVersion: revisionQaResponse.modelVersion,
        inputTokens: revisionQaResponse.usage.inputTokens,
        outputTokens: revisionQaResponse.usage.outputTokens,
      });
      totalCostUsd += revisionQaCostUsd;

      await logPipelineRun({
        matchId,
        contentType,
        stage: 4,
        inputHash: hashInput({ narrative: revised.content }),
        output: revisionQaResponse.result,
        costUsd: revisionQaCostUsd,
        durationMs: Date.now() - revisionQaStartedAt,
        status:
          revisionQaResponse.result.verdict === "retry" ? "retry" : "success",
      });

      if (
        isFactualGroundingHardBlock(revisionQaResponse.result) ||
        revisionQaResponse.result.scores.factual_grounding <
          baselineQa.scores.factual_grounding
      ) {
        finalNarrative = baselineNarrative;
        modelVersion = baselineModelVersion;
        promptVersion = baselinePromptVersion;
        finalQa = {
          ...baselineQa,
          issues: [
            ...new Set([
              ...baselineQa.issues,
              FACTUAL_REVISION_FALLBACK_ISSUE,
            ]),
          ],
          verdict: "publish",
        };
        console.warn(
          "[content-pipeline] discarded length revision with weaker factual grounding",
          {
            baselineFactual: baselineQa.scores.factual_grounding,
            contentType,
            language,
            matchId,
            revisionFactual: revisionQaResponse.result.scores.factual_grounding,
          },
        );
        break;
      }

      if (revisionQaResponse.result.verdict === "publish") {
        break;
      }

      if (isContentLengthIssue(revisionQaResponse.result)) {
        // The ja-recap density gate demotes below-minimum content to draft
        // regardless of verdict, so a publish override would only mask the
        // failure. Keep the honest verdict there and let it land as draft,
        // retaining the fallback issue marker for observability.
        if (contentType === "recap" && language === "ja") {
          finalQa = {
            ...revisionQaResponse.result,
            issues: [
              ...new Set([
                ...revisionQaResponse.result.issues,
                LENGTH_REVISION_FALLBACK_ISSUE,
              ]),
            ],
          };
          console.warn(
            "[content-pipeline] length revision still below minimum",
            {
              contentType,
              language,
              matchId,
            },
          );
          break;
        }

        finalQa = {
          ...revisionQaResponse.result,
          issues: [
            ...new Set([
              ...revisionQaResponse.result.issues,
              LENGTH_REVISION_FALLBACK_ISSUE,
            ]),
          ],
          verdict: "publish",
        };
        console.warn("[content-pipeline] publishing below length minimum", {
          contentType,
          language,
          matchId,
        });
        break;
      }

      if (revisionQaResponse.result.verdict === "reject") {
        break;
      }
    }

    if (qaResponse.result.verdict === "reject") {
      break;
    }
  }

  if (!finalQa) {
    throw new Error("pipeline failed to produce qa result");
  }

  const densityBlocked =
    contentType === "recap" &&
    language === "ja" &&
    finalQa.scores.information_density < DENSITY_PUBLISH_MIN;
  const persistedStatus =
    finalQa.verdict === "publish" && !densityBlocked ? "published" : "draft";

  const { error: upsertError } = await db.from("match_content").upsert(
    {
      match_id: matchId,
      content_type: contentType,
      content_md: finalNarrative,
      language,
      model_version: modelVersion,
      prompt_version: promptVersion,
      status: persistedStatus,
      qa_scores: finalQa,
      generated_at: new Date().toISOString(),
    },
    {
      onConflict: "match_id,content_type,language",
    },
  );

  if (upsertError) {
    throw upsertError;
  }

  if (persistedStatus === "published") {
    const urls = [`${SITE_URL}/matches/${matchId}`];

    if (
      contentType === "recap" &&
      assembled.match.competition?.family === "league-one"
    ) {
      urls.push(`${SITE_URL}/matches/${matchId}/en`);
    }

    await submitUrlsToIndexNow(urls);
  }

  if (persistedStatus === "draft") {
    await notifyContentRejected(matchId, contentType, finalQa);
  }

  if (totalCostUsd > COST_ALERT_THRESHOLD_USD) {
    await notifyCostAlert(
      matchId,
      contentType,
      totalCostUsd,
      COST_ALERT_THRESHOLD_USD,
    );
  }

  return {
    matchId,
    contentType,
    status: persistedStatus,
    qa: finalQa,
  };
}
