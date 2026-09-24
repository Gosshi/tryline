import { createHash } from "node:crypto";

import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";
import {
  buildAllowedPersonEntities,
  buildKnownNonPersonNames,
} from "@/lib/content/allowed-entities";
import { hasConfirmedSourcedFactLineup } from "@/lib/content/fabrication-guard";
import {
  countHeadToHeadMatches,
  getRoundFromExternalIds,
  normalizeHeadToHeadSlug,
} from "@/lib/db/queries/matches";
import { getSupabaseServerClient } from "@/lib/db/server";
import { formatKickoffJst } from "@/lib/format/kickoff";
import {
  getContentLengthRequirement,
  measureContentLength,
} from "@/lib/llm/content-length";
import {
  buildUsableContentInput,
  hasConfirmedProjectedLineups,
} from "@/lib/llm/lineups";
import { MODELS } from "@/lib/llm/models";
import {
  notifyContentQualityRegression,
  notifyContentRejected,
  notifyCostAlert,
  notifyEventIntegrityMismatch,
} from "@/lib/llm/notify";
import { calculateCostUsd } from "@/lib/llm/pricing";
import { assembleMatchContentInput } from "@/lib/llm/stages/assemble";
import { extractTacticalPoints } from "@/lib/llm/stages/extract-facts";
import {
  generateNarrative,
  NARRATIVE_GENERATION_ATTEMPTS,
  reviseNarrativeLength,
} from "@/lib/llm/stages/generate-narrative";
import {
  applyEntityGroundingQaGuard,
  DENSITY_PUBLISH_MIN,
  evaluateNarrativeQuality,
  getDeterministicQaGuardIssues,
  isContentLengthIssue,
  isFactualGroundingHardBlock,
} from "@/lib/llm/stages/qa";
import { verifyNarrativeEntities } from "@/lib/llm/stages/verify-entities";
import { evaluateStyleGuardShadow } from "@/lib/llm/style-guard";
import { submitUrlsToIndexNow } from "@/lib/seo/indexnow";
import { SITE_URL } from "@/lib/site";

import type { Json } from "@/lib/db/types";
import type { ContentModelOverrides } from "@/lib/llm/models";
import type {
  AssembledContentInput,
  ContentLanguage,
  ContentType,
  QaResult,
} from "@/lib/llm/types";

const COST_ALERT_THRESHOLD_USD = 0.2;
const MAX_LENGTH_REVISION_ATTEMPTS = 1;
const LENGTH_REVISION_FALLBACK_ISSUE =
  "字数下限未達のまま加筆リトライ上限に到達しました";
const FACTUAL_REVISION_FALLBACK_ISSUE =
  "加筆リトライで事実根拠が低下したため短い正確な版を採用しました";
const ENTITY_VERIFICATION_FAILED_ISSUE = "entity_verification_failed";

function buildRecentFormRecord(
  recentMatches: AssembledContentInput["recent_form"]["home"],
  teamName: string,
): string | null {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const match of recentMatches) {
    const isHome = match.home_team_name === teamName;
    const isAway = match.away_team_name === teamName;
    if (!isHome && !isAway) {
      continue;
    }

    const scored = isHome ? match.home_score : match.away_score;
    const conceded = isHome ? match.away_score : match.home_score;
    if (scored === null || conceded === null) {
      continue;
    }

    if (scored > conceded) {
      wins += 1;
    } else if (scored < conceded) {
      losses += 1;
    } else {
      draws += 1;
    }
  }

  if (wins === 0 && losses === 0 && draws === 0) {
    return null;
  }

  return [
    wins > 0 ? `${wins}勝` : "",
    losses > 0 ? `${losses}敗` : "",
    draws > 0 ? `${draws}分` : "",
  ].join("");
}

export type PipelineTrialStageMetric = {
  name: "extract-facts" | "generate-narrative" | "qa" | "verify-entities" | "comparison-qa";
  stage: 2 | 3 | 4;
  modelVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

export type PipelineTrialDetails = {
  content: string;
  promptVariant: "A" | "B";
  promptVersion: string;
  promptSha256: string;
  prompt: string;
  inputSha256: string;
  stageMetrics: PipelineTrialStageMetric[];
  lengthRevisionAttempts: number;
  retries: number;
  comparisonQa: QaResult | null;
  comparisonQaCostUsd: number;
  qa: QaResult;
  entityGate: { passed: boolean; ungroundedSurfaces: string[] };
  costUsd: number;
  durationMs: number;
};

export type PipelineResult = {
  matchId: string;
  contentType: ContentType;
  status: "published" | "draft" | "skipped";
  qa: QaResult | null;
  cacheRevalidationSkipped?: boolean;
  skipReason?: "events_unavailable" | "score_mismatch";
  trial?: PipelineTrialDetails;
};

function hashInput(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function hashText(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function getQaScores(value: Json | null): QaResult["scores"] | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  const scores = (value as Record<string, unknown>).scores;
  if (!scores || Array.isArray(scores) || typeof scores !== "object") {
    return null;
  }

  const candidate = scores as Record<string, unknown>;
  const keys = [
    "information_density",
    "japanese_quality",
    "factual_grounding",
    "tactical_depth",
  ] as const;
  if (!keys.every((key) => typeof candidate[key] === "number")) {
    return null;
  }

  return {
    factual_grounding: candidate.factual_grounding as number,
    information_density: candidate.information_density as number,
    japanese_quality: candidate.japanese_quality as number,
    tactical_depth: candidate.tactical_depth as number,
  };
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
  options: {
    models?: ContentModelOverrides;
    persist?: boolean;
    comparisonQaModel?: string;
    promptVariant?: "A" | "B";
    frozenInput?: {
      assembled: AssembledContentInput & {
        eventIntegrity?: import("@/lib/llm/stages/assemble").AssembledEventIntegrity;
      };
      tacticalPoints: import("@/lib/llm/types").TacticalPoint[];
    };
    trialFirstAttemptOnly?: boolean;
  } = {},
): Promise<PipelineResult> {
  const trialOptionSpecified = [
    "promptVariant",
    "frozenInput",
    "trialFirstAttemptOnly",
  ].some((key) => Object.hasOwn(options, key));
  if (trialOptionSpecified && options.persist !== false) {
    throw new Error("Prompt experiment options require persist: false");
  }
  const promptVariant = options.promptVariant ?? "A";
  if (promptVariant === "B" && language !== "ja") {
    throw new Error("Prompt variant B is available for Japanese content only");
  }
  const trialStartedAt = Date.now();
  const persist = options.persist !== false;
  const db = getSupabaseServerClient();
  const trialStageMetrics: PipelineTrialStageMetric[] = [];
  const recordPipelineRun = (entry: Parameters<typeof logPipelineRun>[0]) =>
    persist ? logPipelineRun(entry) : Promise.resolve();

  const stage1StartedAt = Date.now();
  const assembled = options.frozenInput?.assembled ?? await assembleMatchContentInput(
    matchId,
    language,
    contentType,
  );
  if (!options.frozenInput) {
    await recordPipelineRun({
      matchId,
      contentType,
      stage: 1,
      inputHash: hashInput({ matchId }),
      output: assembled,
      costUsd: 0,
      durationMs: Date.now() - stage1StartedAt,
      status: "success",
    });
  }

  if (
    contentType === "recap" &&
    assembled.eventIntegrity?.status === "mismatch"
  ) {
    const { actual, delta, expected } = assembled.eventIntegrity;

    console.warn("[score-integrity] event total mismatch", {
      awayDelta: delta.away,
      homeDelta: delta.home,
      matchId,
    });

    await recordPipelineRun({
      matchId,
      contentType,
      stage: 0,
      inputHash: "",
      output: {
        awayDelta: delta.away,
        homeDelta: delta.home,
        type: "score_event_mismatch",
      },
      costUsd: 0,
      durationMs: 0,
      status: "failed",
    });
    if (persist) {
      await notifyEventIntegrityMismatch({
        actualAway: actual.away,
        actualHome: actual.home,
        competitionLabel: assembled.match.competition
          ? `${assembled.match.competition.name} ${assembled.match.competition.season}`
          : undefined,
        expectedAway: expected.away,
        expectedHome: expected.home,
        matchId,
        matchLabel: `${assembled.match.home_team?.name ?? "Home"} 対 ${assembled.match.away_team?.name ?? "Away"}`,
      });
    }

    return {
      matchId,
      contentType,
      status: "skipped",
      qa: null,
      skipReason: "score_mismatch",
    };
  }

  if (
    contentType === "recap" &&
    assembled.eventIntegrity?.reason === "events_unavailable"
  ) {
    return {
      matchId,
      contentType,
      status: "skipped",
      qa: null,
      skipReason: "events_unavailable",
    };
  }

  const usable = buildUsableContentInput(assembled);
  const hasEvents = usable.match_events.length > 0;
  const hasLineups = hasConfirmedProjectedLineups(usable.projected_lineups);
  const hasSourcedFactLineup = hasConfirmedSourcedFactLineup(
    usable.sourced_facts,
  );
  const allowedEntities = buildAllowedPersonEntities(usable);
  const knownNonPersonNames = buildKnownNonPersonNames(usable);
  let totalCostUsd = 0;

  const stage2StartedAt = Date.now();
  let tactical: Awaited<ReturnType<typeof extractTacticalPoints>>;
  if (options.frozenInput) {
    tactical = {
      result: { tactical_points: options.frozenInput.tacticalPoints },
      modelVersion: "frozen-input",
      promptVersion: "frozen-input",
      usage: { inputTokens: 0, outputTokens: 0 },
      attempts: 0,
    };
  } else try {
    tactical = await extractTacticalPoints(usable, options.models?.fast);
  } catch (error) {
    await recordPipelineRun({
      matchId,
      contentType,
      stage: 2,
      inputHash: hashInput(usable),
      durationMs: Date.now() - stage2StartedAt,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "extract failed",
    });
    throw error;
  }

  const stage2CostUsd = options.frozenInput ? 0 : calculateCostUsd({
    modelVersion: tactical.modelVersion,
    inputTokens: tactical.usage.inputTokens,
    outputTokens: tactical.usage.outputTokens,
  });
  totalCostUsd += stage2CostUsd;
  if (!options.frozenInput) trialStageMetrics.push({
    name: "extract-facts",
    stage: 2,
    modelVersion: tactical.modelVersion,
    inputTokens: tactical.usage.inputTokens,
    outputTokens: tactical.usage.outputTokens,
    costUsd: stage2CostUsd,
    durationMs: Date.now() - stage2StartedAt,
  });

  if (!options.frozenInput) await recordPipelineRun({
    matchId,
    contentType,
    stage: 2,
    inputHash: hashInput(usable),
    output: tactical.result,
    costUsd: stage2CostUsd,
    durationMs: Date.now() - stage2StartedAt,
    status: "success",
  });

  let finalQa: QaResult | null = null;
  let finalNarrative = "";
  let modelVersion = "";
  let promptVersion = "";
  let narrativePrompt = "";
  let lengthRevisionAttempts = 0;
  let narrativeAttempts = 0;
  let entityViolationFeedback: string[] = [];
  let entityGatePassed = true;
  let comparisonQa: QaResult | null = null;
  let comparisonQaCostUsd = 0;

  async function runQualityGate(gateOptions: {
    narrative: string;
    retryCount: number;
    qaModel?: string;
    verifyEntities?: boolean;
  }) {
    const [entityVerification, qaResponse] = await Promise.all([
      gateOptions.verifyEntities === false
        ? Promise.resolve(null)
        : verifyNarrativeEntities({
            allowedEntities,
            knownNonPersonNames,
            model: options.models?.fast,
            narrative: gateOptions.narrative,
            sourcedFacts: usable.sourced_facts,
          }),
      evaluateNarrativeQuality({
        contentType,
        language,
        matchContext: {
          awayScore: usable.match.away_score,
          awayTeam: usable.match.away_team?.name ?? "Away",
          competitionName: usable.match.competition?.name ?? null,
          ...(usable.competition_standings.length > 0
            ? { competitionStandings: usable.competition_standings }
            : {}),
          derivedStats: usable.derived_stats,
          formStats: {
            away: {
              avg_points_against_last_5:
                usable.key_stats.away.avg_points_against_last_5,
              avg_points_for_last_5:
                usable.key_stats.away.avg_points_for_last_5,
              record_last_5: buildRecentFormRecord(
                usable.recent_form.away,
                usable.match.away_team?.name ?? "Away",
              ),
              win_rate_last_5: usable.key_stats.away.win_rate_last_5,
            },
            home: {
              avg_points_against_last_5:
                usable.key_stats.home.avg_points_against_last_5,
              avg_points_for_last_5:
                usable.key_stats.home.avg_points_for_last_5,
              record_last_5: buildRecentFormRecord(
                usable.recent_form.home,
                usable.match.home_team?.name ?? "Home",
              ),
              win_rate_last_5: usable.key_stats.home.win_rate_last_5,
            },
          },
          homeScore: usable.match.home_score,
          homeTeam: usable.match.home_team?.name ?? "Home",
          japanese_name_glossary: usable.japanese_name_glossary,
          match_events: usable.match_events,
          projected_lineups: usable.projected_lineups,
          recent_form: usable.recent_form,
          score_timeline: usable.score_timeline,
          sourcedFacts: usable.sourced_facts,
          teamStats: usable.team_stats,
          venue: usable.match.venue,
        },
        hasConfirmedSourcedFactLineup: hasSourcedFactLineup,
        hasEvents,
        hasLineups,
        matchEvents: usable.match_events,
        model: gateOptions.qaModel ?? options.models?.fast,
        narrative: gateOptions.narrative,
        retryCount: gateOptions.retryCount,
      }),
    ]);
    const entityViolations =
      entityVerification?.result.ungroundedSurfaces ?? entityViolationFeedback;

    return {
      entityVerification,
      qaResponse: {
        ...qaResponse,
        result: applyEntityGroundingQaGuard(qaResponse.result, {
          contentType,
          entityViolations,
          retryCount: gateOptions.retryCount,
        }),
      },
    };
  }

  const narrativeAttemptLimit = options.trialFirstAttemptOnly
    ? 1
    : NARRATIVE_GENERATION_ATTEMPTS;
  for (let attempt = 0; attempt < narrativeAttemptLimit; attempt += 1) {
    narrativeAttempts += 1;
    const stage3StartedAt = Date.now();
    const narrative = await generateNarrative({
      assembled: usable,
      tacticalPoints: tactical.result.tactical_points,
      contentType,
      // TODO(D009): Reddit/SNS シグナルが実装されたらここに渡す。現在は常に空配列。
      additionalSignals: [],
      attempt,
      entityViolationSurfaces: entityViolationFeedback,
      language,
      model: options.models?.narrative,
      promptVariant,
    });

    finalNarrative = narrative.content;
    modelVersion = narrative.modelVersion;
    promptVersion = narrative.promptVersion;
    narrativePrompt = narrative.prompt;

    const stage3CostUsd = calculateCostUsd({
      modelVersion: narrative.modelVersion,
      inputTokens: narrative.usage.inputTokens,
      outputTokens: narrative.usage.outputTokens,
    });
    totalCostUsd += stage3CostUsd;
    trialStageMetrics.push({
      name: "generate-narrative",
      stage: 3,
      modelVersion: narrative.modelVersion,
      inputTokens: narrative.usage.inputTokens,
      outputTokens: narrative.usage.outputTokens,
      costUsd: stage3CostUsd,
      durationMs: Date.now() - stage3StartedAt,
    });

    await recordPipelineRun({
      matchId,
      contentType,
      stage: 3,
      inputHash: hashInput({
        assembled: usable,
        tactical: tactical.result,
        // TODO(D009): Reddit/SNS シグナルが実装されたらここに渡す。現在は常に空配列。
        additionalSignals: [],
      }),
      output: {
        content: narrative.content,
      },
      costUsd: stage3CostUsd,
      durationMs: Date.now() - stage3StartedAt,
      status: "success",
    });

    const stage4StartedAt = Date.now();
    let qaResponse;
    let entityVerification;

    try {
      const result = await runQualityGate({
        narrative: narrative.content,
        retryCount: attempt,
      });
      qaResponse = result.qaResponse;
      entityVerification = result.entityVerification;
    } catch (error) {
      await recordPipelineRun({
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

      if (
        error instanceof Error &&
        error.message.startsWith("entity verification failed")
      ) {
        entityGatePassed = false;
      }
      finalQa = {
        scores: {
          information_density: 1,
          japanese_quality: 1,
          factual_grounding: 1,
          tactical_depth: 1,
        },
        issues: [
          error instanceof Error &&
          error.message.startsWith("entity verification failed")
            ? ENTITY_VERIFICATION_FAILED_ISSUE
            : "qa_json_parse_failed",
        ],
        verdict: "reject",
      };

      break;
    }

    finalQa = qaResponse.result;
    entityViolationFeedback =
      entityVerification?.result.ungroundedSurfaces ?? [];

    const stage4CostUsd = calculateCostUsd({
      modelVersion: qaResponse.modelVersion,
      inputTokens: qaResponse.usage.inputTokens,
      outputTokens: qaResponse.usage.outputTokens,
    });
    const entityVerificationCostUsd = entityVerification
      ? calculateCostUsd({
          modelVersion: entityVerification.modelVersion,
          inputTokens: entityVerification.usage.inputTokens,
          outputTokens: entityVerification.usage.outputTokens,
        })
      : 0;
    totalCostUsd += stage4CostUsd + entityVerificationCostUsd;
    trialStageMetrics.push({
      name: "qa",
      stage: 4,
      modelVersion: qaResponse.modelVersion,
      inputTokens: qaResponse.usage.inputTokens,
      outputTokens: qaResponse.usage.outputTokens,
      costUsd: stage4CostUsd,
      durationMs: Date.now() - stage4StartedAt,
    });
    if (entityVerification) {
      trialStageMetrics.push({
        name: "verify-entities",
        stage: 4,
        modelVersion: entityVerification.modelVersion,
        inputTokens: entityVerification.usage.inputTokens,
        outputTokens: entityVerification.usage.outputTokens,
        costUsd: entityVerificationCostUsd,
        durationMs: Date.now() - stage4StartedAt,
      });
    }

    await recordPipelineRun({
      matchId,
      contentType,
      stage: 4,
      inputHash: hashInput({ narrative: narrative.content }),
      output: {
        qa: qaResponse.result,
        entityVerification: entityVerification?.result ?? null,
      },
      costUsd: stage4CostUsd + entityVerificationCostUsd,
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
      !options.trialFirstAttemptOnly &&
      lengthRevisionAttempts < MAX_LENGTH_REVISION_ATTEMPTS
    ) {
      const baselineNarrative = finalNarrative;
      const baselineModelVersion = modelVersion;
      const baselinePromptVersion = promptVersion;
      const baselineNarrativePrompt = narrativePrompt;
      const baselineQa = qaResponse.result;
      const baselineEntityViolationFeedback = entityViolationFeedback;
      lengthRevisionAttempts += 1;
      const revisionStartedAt = Date.now();
      const revised = await reviseNarrativeLength({
        additionalSignals: [],
        assembled: usable,
        contentType,
        currentContent: finalNarrative,
        entityViolationSurfaces: entityViolationFeedback,
        language,
        promptVersion,
        tacticalPoints: tactical.result.tactical_points,
        model: options.models?.narrative,
      });

      finalNarrative = revised.content;
      modelVersion = revised.modelVersion;
      promptVersion = revised.promptVersion;
      narrativePrompt = revised.prompt;

      const revisionCostUsd = calculateCostUsd({
        modelVersion: revised.modelVersion,
        inputTokens: revised.usage.inputTokens,
        outputTokens: revised.usage.outputTokens,
      });
      totalCostUsd += revisionCostUsd;
      trialStageMetrics.push({
        name: "generate-narrative",
        stage: 3,
        modelVersion: revised.modelVersion,
        inputTokens: revised.usage.inputTokens,
        outputTokens: revised.usage.outputTokens,
        costUsd: revisionCostUsd,
        durationMs: Date.now() - revisionStartedAt,
      });

      await recordPipelineRun({
        matchId,
        contentType,
        stage: 3,
        inputHash: hashInput({
          assembled: usable,
          contentType,
          currentContent: narrative.content,
          reason: "content_length_under_minimum",
          tactical: tactical.result,
        }),
        output: {
          content: revised.content,
          lengthRevisionAttempts,
          reason: "content_length_under_minimum",
        },
        costUsd: revisionCostUsd,
        durationMs: Date.now() - revisionStartedAt,
        status: "retry",
      });

      const revisionQaStartedAt = Date.now();
      let revisionEntityVerification;
      let revisionQaResponse;
      try {
        const result = await runQualityGate({
          narrative: revised.content,
          retryCount: attempt + 1,
        });
        revisionEntityVerification = result.entityVerification;
        revisionQaResponse = result.qaResponse;
      } catch (error) {
        await recordPipelineRun({
          matchId,
          contentType,
          stage: 4,
          inputHash: hashInput({ narrative: revised.content }),
          output: {
            narrative: revised.content,
          },
          durationMs: Date.now() - revisionQaStartedAt,
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "revision qa failed",
        });

        if (
          error instanceof Error &&
          error.message.startsWith("entity verification failed")
        ) {
          entityGatePassed = false;
        }
        finalQa = {
          scores: {
            information_density: 1,
            japanese_quality: 1,
            factual_grounding: 1,
            tactical_depth: 1,
          },
          issues: [
            error instanceof Error &&
            error.message.startsWith("entity verification failed")
              ? ENTITY_VERIFICATION_FAILED_ISSUE
              : "qa_json_parse_failed",
          ],
          verdict: "reject",
        };
        break;
      }
      finalQa = revisionQaResponse.result;
      entityViolationFeedback =
        revisionEntityVerification?.result.ungroundedSurfaces ?? [];

      const revisionQaCostUsd = calculateCostUsd({
        modelVersion: revisionQaResponse.modelVersion,
        inputTokens: revisionQaResponse.usage.inputTokens,
        outputTokens: revisionQaResponse.usage.outputTokens,
      });
      const revisionEntityVerificationCostUsd = calculateCostUsd({
        modelVersion: revisionEntityVerification!.modelVersion,
        inputTokens: revisionEntityVerification!.usage.inputTokens,
        outputTokens: revisionEntityVerification!.usage.outputTokens,
      });
      totalCostUsd += revisionQaCostUsd + revisionEntityVerificationCostUsd;
      trialStageMetrics.push({
        name: "qa",
        stage: 4,
        modelVersion: revisionQaResponse.modelVersion,
        inputTokens: revisionQaResponse.usage.inputTokens,
        outputTokens: revisionQaResponse.usage.outputTokens,
        costUsd: revisionQaCostUsd,
        durationMs: Date.now() - revisionQaStartedAt,
      });
      if (revisionEntityVerification) {
        trialStageMetrics.push({
          name: "verify-entities",
          stage: 4,
          modelVersion: revisionEntityVerification.modelVersion,
          inputTokens: revisionEntityVerification.usage.inputTokens,
          outputTokens: revisionEntityVerification.usage.outputTokens,
          costUsd: revisionEntityVerificationCostUsd,
          durationMs: Date.now() - revisionQaStartedAt,
        });
      }

      await recordPipelineRun({
        matchId,
        contentType,
        stage: 4,
        inputHash: hashInput({ narrative: revised.content }),
        output: {
          qa: revisionQaResponse.result,
          entityVerification: revisionEntityVerification!.result,
        },
        costUsd: revisionQaCostUsd + revisionEntityVerificationCostUsd,
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
        narrativePrompt = baselineNarrativePrompt;
        finalQa = {
          ...baselineQa,
          issues: [
            ...new Set([...baselineQa.issues, FACTUAL_REVISION_FALLBACK_ISSUE]),
          ],
          verdict: "publish",
        };
        entityViolationFeedback = baselineEntityViolationFeedback;
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

  if (options.comparisonQaModel) {
    const comparisonStartedAt = Date.now();
    const comparison = await runQualityGate({
      narrative: finalNarrative,
      retryCount: 0,
      qaModel: options.comparisonQaModel,
      verifyEntities: false,
    });
    comparisonQa = comparison.qaResponse.result;
    comparisonQaCostUsd = calculateCostUsd({
      modelVersion: comparison.qaResponse.modelVersion,
      inputTokens: comparison.qaResponse.usage.inputTokens,
      outputTokens: comparison.qaResponse.usage.outputTokens,
    });
    trialStageMetrics.push({
      name: "comparison-qa",
      stage: 4,
      modelVersion: comparison.qaResponse.modelVersion,
      inputTokens: comparison.qaResponse.usage.inputTokens,
      outputTokens: comparison.qaResponse.usage.outputTokens,
      costUsd: comparisonQaCostUsd,
      durationMs: Date.now() - comparisonStartedAt,
    });
  }

  let persistedQaScores: Json = finalQa;

  if (
    persist &&
    language === "ja" &&
    (contentType === "preview" || contentType === "recap")
  ) {
    const { data: recentContent, error: recentContentError } = await db
      .from("match_content")
      .select("id, content_md")
      .eq("status", "published")
      .eq("content_type", contentType)
      .eq("language", language)
      .order("generated_at", { ascending: false })
      .limit(50);

    if (recentContentError) {
      throw recentContentError;
    }

    persistedQaScores = {
      ...finalQa,
      style_guard_shadow: evaluateStyleGuardShadow({
        content: finalNarrative,
        japaneseQuality: finalQa.scores.japanese_quality,
        recentArticles: (recentContent ?? []).map((content) => ({
          content: content.content_md,
          id: content.id,
        })),
      }),
    };
  }

  const densityBlocked =
    contentType === "recap" &&
    language === "ja" &&
    finalQa.scores.information_density < DENSITY_PUBLISH_MIN;
  const persistedStatus =
    finalQa.verdict === "publish" && !densityBlocked ? "published" : "draft";

  const { data: existingContent, error: existingContentError } = await db
    .from("match_content")
    .select("status, qa_scores, content_md")
    .eq("match_id", matchId)
    .eq("content_type", contentType)
    .eq("language", language)
    .maybeSingle();

  if (existingContentError) {
    throw existingContentError;
  }

  let preservedPublished = false;
  let cacheRevalidationSkipped = false;

  if (persistedStatus === "draft") {
    preservedPublished = existingContent?.status === "published";
  }

  if (persist && !preservedPublished) {
    const { error: upsertError } = await db.from("match_content").upsert(
      {
        match_id: matchId,
        content_type: contentType,
        content_md: finalNarrative,
        language,
        model_version: modelVersion,
        prompt_version: promptVersion,
        status: persistedStatus,
        qa_scores: persistedQaScores,
        generated_at: new Date().toISOString(),
      },
      {
        onConflict: "match_id,content_type,language",
      },
    );

    if (upsertError) {
      throw upsertError;
    }

    const revalidation = revalidatePublicData(
      PUBLIC_DATA_CACHE_TAGS.content,
      PUBLIC_DATA_CACHE_TAGS.matches,
    );
    cacheRevalidationSkipped = (revalidation?.skippedTags.length ?? 0) > 0;
  }

  const contentLengthRequirement = getContentLengthRequirement(
    contentType,
    language,
  );
  const contentLength = measureContentLength(
    finalNarrative,
    contentLengthRequirement,
  );
  const matchLabel = `${usable.match.home_team?.name ?? "ホーム不明"} 対 ${usable.match.away_team?.name ?? "アウェイ不明"}`;
  const kickoffAtJst = formatKickoffJst(usable.match.kickoff_at);

  if (
    persist &&
    persistedStatus === "published" &&
    existingContent?.status === "published"
  ) {
    const previousScores = getQaScores(existingContent.qa_scores);

    if (previousScores) {
      await notifyContentQualityRegression({
        contentType,
        currentContentLength: contentLength,
        currentScores: finalQa.scores,
        kickoffAtJst,
        matchLabel,
        previousContentLength: measureContentLength(
          existingContent.content_md,
          contentLengthRequirement,
        ),
        previousScores,
      });
    }
  }

  if (persist && persistedStatus === "published") {
    const urls = [`${SITE_URL}/matches/${matchId}`];
    const competition = usable.match.competition;

    if (competition?.family && competition.season) {
      const competitionUrl = `${SITE_URL}/c/${competition.family}/${competition.season}`;
      urls.push(competitionUrl);

      const { data: matchRow } = await db
        .from("matches")
        .select("external_ids")
        .eq("id", matchId)
        .maybeSingle();
      const round = getRoundFromExternalIds(matchRow?.external_ids ?? null);

      if (round !== null) {
        urls.push(`${competitionUrl}/round/${round}`);
      }
    }

    urls.push(`${SITE_URL}/calendar`);

    const homeTeamSlug = usable.match.home_team?.slug;
    const awayTeamSlug = usable.match.away_team?.slug;
    if (contentType === "preview" && homeTeamSlug && awayTeamSlug) {
      try {
        const h2hMatchCount = await countHeadToHeadMatches(
          homeTeamSlug,
          awayTeamSlug,
        );

        if (h2hMatchCount >= 2) {
          urls.push(
            `${SITE_URL}/h2h/${normalizeHeadToHeadSlug(homeTeamSlug, awayTeamSlug)}`,
          );
        }
      } catch (error) {
        console.error("[content-pipeline] H2H IndexNow lookup failed", {
          awayTeamSlug,
          error,
          homeTeamSlug,
          matchId,
        });
      }
    }

    if (
      contentType === "recap" &&
      usable.match.competition?.family === "league-one"
    ) {
      urls.push(`${SITE_URL}/matches/${matchId}/en`);
    }

    await submitUrlsToIndexNow(urls);
  }

  if (persist && persistedStatus === "draft") {
    if (preservedPublished) {
      console.warn(
        "[content-pipeline] preserved existing published content after rejection",
        {
          contentLength,
          contentType,
          issues: finalQa.issues,
          language,
          matchId,
        },
      );
    }

    await notifyContentRejected(matchId, contentType, finalQa, {
      contentLength,
      diagnostics: {
        contentLength,
        contentLengthMinimum: contentLengthRequirement.min,
        contentLengthUnit: contentLengthRequirement.unit,
        deterministicGuardIssues: getDeterministicQaGuardIssues(finalQa),
        kickoffAtJst,
        lineupCount: hasLineups
          ? usable.projected_lineups.home.length +
            usable.projected_lineups.away.length
          : 0,
        matchLabel,
        sourcedFactsCount: usable.sourced_facts.length,
      },
      ...(preservedPublished ? { preservedPublished: true } : {}),
    });
  }

  if (persist && totalCostUsd > COST_ALERT_THRESHOLD_USD) {
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
    ...(cacheRevalidationSkipped ? { cacheRevalidationSkipped: true } : {}),
    ...(!persist
      ? {
          trial: {
            content: finalNarrative,
            promptVariant,
            promptVersion,
            promptSha256: hashText(narrativePrompt),
            prompt: narrativePrompt,
            inputSha256: hashInput({
              usable,
              tacticalPoints: tactical.result.tactical_points,
            }),
            stageMetrics: trialStageMetrics,
            lengthRevisionAttempts,
            retries: Math.max(0, narrativeAttempts - 1) + lengthRevisionAttempts,
            comparisonQa,
            comparisonQaCostUsd,
            qa: finalQa,
            entityGate: {
              passed:
                entityGatePassed && entityViolationFeedback.length === 0,
              ungroundedSurfaces: entityViolationFeedback,
            },
            costUsd: trialStageMetrics
              .filter((stage) => stage.name !== "comparison-qa")
              .reduce((sum, stage) => sum + stage.costUsd, 0),
            durationMs: Date.now() - trialStartedAt,
          },
        }
      : {}),
  };
}
