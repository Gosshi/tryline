import {
  containsContradictedZeroStatClaim,
  containsUngroundedPlayerReference,
  containsUnsupportedStatistic,
  CONTRADICTED_ZERO_STAT_CLAIM_ISSUE,
  UNGROUNDED_ENTITY_ISSUE,
  UNGROUNDED_PLAYER_REFERENCE_ISSUE,
  UNSUPPORTED_STATISTIC_ISSUE,
  PLAYER_STAT_MISMATCH_ISSUE,
  WINNER_MISMATCH_ISSUE,
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
  type TeamFormStats,
} from "@/lib/llm/prompts/qa-content";
import {
  buildPlayerStatsFromEvents,
  findActualPlayerStats,
  type ActualPlayerStats,
} from "@/lib/stats/player-stats";

import type {
  AssembledContentInput,
  ContentLanguage,
  ContentType,
  MatchTeamStats,
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
  statedPlayerStats?: unknown;
  statedWinner?: unknown;
};

export const DENSITY_PUBLISH_MIN = 4;
export type ActualWinner = "away" | "draw" | "home" | null;
type StatedWinner = "away" | "home" | "unclear";
type StatedPlayerStatClaim = {
  conversions?: number;
  penaltyGoals?: number;
  playerName: string;
  totalPoints?: number;
  tries?: number;
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
    result.issues.includes(UNGROUNDED_ENTITY_ISSUE) ||
    result.issues.includes(UNGROUNDED_PLAYER_REFERENCE_ISSUE) ||
    result.issues.includes(UNSUPPORTED_STATISTIC_ISSUE) ||
    result.issues.includes(CONTRADICTED_ZERO_STAT_CLAIM_ISSUE) ||
    result.issues.includes(PLAYER_STAT_MISMATCH_ISSUE) ||
    result.issues.includes(WINNER_MISMATCH_ISSUE)
  );
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function buildFactsForSide(
  label: string,
  stats: NonNullable<MatchTeamStats>["home"],
): string[] {
  if (!stats) {
    return [];
  }

  const facts: string[] = [];

  if (typeof stats.possession_pct === "number") {
    facts.push(
      `${label}チームのポゼッション率${formatPercent(stats.possession_pct)}`,
    );
  }
  if (typeof stats.territory_pct === "number") {
    facts.push(
      `${label}チームのテリトリー率${formatPercent(stats.territory_pct)}`,
    );
  }
  if (
    typeof stats.lineouts_won === "number" &&
    typeof stats.lineouts_total === "number"
  ) {
    facts.push(
      `${label}チームのラインアウト${stats.lineouts_won}/${stats.lineouts_total}`,
    );
  } else if (typeof stats.lineouts_won === "number") {
    facts.push(`${label}チームのラインアウト獲得${stats.lineouts_won}`);
  }
  if (typeof stats.lineout_success_pct === "number") {
    facts.push(
      `${label}チームのラインアウト成功率${formatPercent(stats.lineout_success_pct)}`,
    );
  }
  if (
    typeof stats.scrums_won === "number" &&
    typeof stats.scrums_total === "number"
  ) {
    facts.push(
      `${label}チームのスクラム${stats.scrums_won}/${stats.scrums_total}`,
    );
  } else if (typeof stats.scrums_won === "number") {
    facts.push(`${label}チームのスクラム獲得${stats.scrums_won}`);
  }
  if (typeof stats.scrum_success_pct === "number") {
    facts.push(
      `${label}チームのスクラム成功率${formatPercent(stats.scrum_success_pct)}`,
    );
  }
  if (typeof stats.tackles_made === "number") {
    facts.push(`${label}チームのタックル成功${stats.tackles_made}`);
  }
  if (typeof stats.tackles_missed === "number") {
    facts.push(`${label}チームのタックルミス${stats.tackles_missed}`);
  }
  if (typeof stats.carries === "number") {
    facts.push(`${label}チームのキャリー${stats.carries}`);
  }
  if (typeof stats.turnovers === "number") {
    facts.push(`${label}チームのターンオーバー${stats.turnovers}回`);
  }
  if (typeof stats.metres_gained === "number") {
    facts.push(`${label}チームの獲得メートル${stats.metres_gained}m`);
  }
  if (typeof stats.penalties_conceded === "number") {
    facts.push(`${label}チームのペナルティ${stats.penalties_conceded}`);
  }
  if (typeof stats.yellow_cards === "number") {
    facts.push(`${label}チームのイエローカード${stats.yellow_cards}`);
  }
  if (typeof stats.red_cards === "number") {
    facts.push(`${label}チームのレッドカード${stats.red_cards}`);
  }
  if (typeof stats.errors === "number") {
    facts.push(`${label}チームのエラー${stats.errors}`);
  }

  return facts;
}

export function buildTeamStatsFactStrings(
  teamStats?: MatchTeamStats,
): string[] {
  if (!teamStats) {
    return [];
  }

  return [
    ...buildFactsForSide("ホーム", teamStats.home),
    ...buildFactsForSide("アウェイ", teamStats.away),
  ];
}

function buildFormStatsFactsForSide(
  label: string,
  stats: TeamFormStats | null | undefined,
): string[] {
  if (!stats || typeof stats.win_rate_last_5 !== "number") {
    return [];
  }

  const winRatePercent = stats.win_rate_last_5 * 100;
  const facts = [`${label}チームの勝率${formatPercent(winRatePercent)}`];

  if (Number.isInteger(winRatePercent)) {
    facts.push(`${label}チームの勝率${winRatePercent.toFixed(1)}%`);
  }

  return facts;
}

export function buildFormStatsFactStrings(
  formStats?: QaMatchContext["formStats"],
): string[] {
  if (!formStats) {
    return [];
  }

  return [
    ...buildFormStatsFactsForSide("ホーム", formStats.home),
    ...buildFormStatsFactsForSide("アウェイ", formStats.away),
  ];
}

export function computeActualWinner(
  homeScore: number | null,
  awayScore: number | null,
): ActualWinner {
  if (homeScore === null || awayScore === null) {
    return null;
  }

  if (homeScore === awayScore) {
    return "draw";
  }

  return homeScore > awayScore ? "home" : "away";
}

function parseStatedWinner(value: unknown): StatedWinner | null {
  return value === "home" || value === "away" || value === "unclear"
    ? value
    : null;
}

function parseNumberClaim(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function parseStatedPlayerStats(value: unknown): StatedPlayerStatClaim[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.playerName !== "string") {
      return [];
    }

    const claim: StatedPlayerStatClaim = {
      playerName: candidate.playerName.trim(),
    };
    const tries = parseNumberClaim(candidate.tries);
    const conversions = parseNumberClaim(candidate.conversions);
    const penaltyGoals = parseNumberClaim(candidate.penaltyGoals);
    const totalPoints = parseNumberClaim(candidate.totalPoints);

    if (tries !== undefined) claim.tries = tries;
    if (conversions !== undefined) claim.conversions = conversions;
    if (penaltyGoals !== undefined) claim.penaltyGoals = penaltyGoals;
    if (totalPoints !== undefined) claim.totalPoints = totalPoints;

    return claim.playerName &&
      (tries !== undefined ||
        conversions !== undefined ||
        penaltyGoals !== undefined ||
        totalPoints !== undefined)
      ? [claim]
      : [];
  });
}

function playerStatClaimMatchesActual(
  claim: StatedPlayerStatClaim,
  actual: ActualPlayerStats,
) {
  return (
    (claim.tries === undefined || claim.tries === actual.tries) &&
    (claim.conversions === undefined ||
      claim.conversions === actual.conversions) &&
    (claim.penaltyGoals === undefined ||
      claim.penaltyGoals === actual.penaltyGoals) &&
    (claim.totalPoints === undefined ||
      claim.totalPoints === actual.totalPoints)
  );
}

function buildPlayerStatPromptNames(
  events: AssembledContentInput["match_events"] | undefined,
): string[] {
  return [...buildPlayerStatsFromEvents(events ?? []).values()].map(
    (entry) => entry.playerName,
  );
}

// Single source of truth for QA verdicts. The LLM scores content only; code
// applies the stable retry/reject thresholds used by the pipeline.
export function resolveVerdict(
  scores: QaResult["scores"],
  retryCount: number,
  factualHardBlock: boolean,
  lengthUnderMinimum: boolean,
  contentType: ContentType,
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
  const densityOk =
    contentType !== "recap" ||
    scores.information_density >= DENSITY_PUBLISH_MIN;

  if (scoreValues.every((score) => score >= 3) && densityOk) {
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
    hasLineups: boolean;
    language: ContentLanguage;
    matchContext: QaMatchContext;
    narrative: string;
    entityViolations?: string[];
    matchEvents?: AssembledContentInput["match_events"];
    statedPlayerStats?: StatedPlayerStatClaim[];
    statedWinner?: StatedWinner | null;
  },
): QaResult {
  let guarded = result;
  const actualWinner = computeActualWinner(
    options.matchContext.homeScore,
    options.matchContext.awayScore,
  );

  if (
    options.contentType === "recap" &&
    (actualWinner === "home" || actualWinner === "away") &&
    (options.statedWinner === "home" || options.statedWinner === "away") &&
    actualWinner !== options.statedWinner
  ) {
    guarded = {
      ...guarded,
      issues: appendIssue(guarded.issues, WINNER_MISMATCH_ISSUE),
      scores: {
        ...guarded.scores,
        factual_grounding: 1,
      },
    };
  }

  if (
    options.contentType === "recap" &&
    options.hasEvents &&
    (options.statedPlayerStats ?? []).length > 0
  ) {
    const statedPlayerStats = options.statedPlayerStats ?? [];
    const statsByPlayer = buildPlayerStatsFromEvents(options.matchEvents ?? []);
    const hasMismatch = statedPlayerStats.some((claim) => {
      const actual = findActualPlayerStats(claim.playerName, statsByPlayer);

      return !actual || !playerStatClaimMatchesActual(claim, actual);
    });

    if (hasMismatch) {
      guarded = {
        ...guarded,
        issues: appendIssue(guarded.issues, PLAYER_STAT_MISMATCH_ISSUE),
        scores: {
          ...guarded.scores,
          factual_grounding: 1,
        },
      };
    }
  }

  if ((options.entityViolations ?? []).length > 0) {
    guarded = {
      ...guarded,
      issues: appendIssue(guarded.issues, UNGROUNDED_ENTITY_ISSUE),
      scores: {
        ...guarded.scores,
        factual_grounding: 1,
      },
    };
  }

  if (
    containsUnsupportedStatistic(options.narrative, [
      ...(options.matchContext.sourcedFacts?.map((fact) => fact.fact) ?? []),
      ...buildTeamStatsFactStrings(options.matchContext.teamStats),
      ...buildFormStatsFactStrings(options.matchContext.formStats),
    ])
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

  if (
    containsContradictedZeroStatClaim(
      options.narrative,
      options.matchContext.teamStats,
    )
  ) {
    guarded = {
      ...guarded,
      issues: appendIssue(guarded.issues, CONTRADICTED_ZERO_STAT_CLAIM_ISSUE),
      scores: {
        ...guarded.scores,
        factual_grounding: 1,
      },
    };
  }

  if (
    containsUngroundedPlayerReference(
      options.narrative,
      options.hasLineups,
      options.hasEvents,
    )
  ) {
    guarded = {
      ...guarded,
      issues: appendIssue(guarded.issues, UNGROUNDED_PLAYER_REFERENCE_ISSUE),
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

export function applyEntityGroundingQaGuard(
  result: QaResult,
  options: {
    contentType: ContentType;
    entityViolations: string[];
    retryCount: number;
  },
): QaResult {
  if (options.entityViolations.length === 0) {
    return result;
  }

  const guarded = {
    ...result,
    issues: appendIssue(result.issues, UNGROUNDED_ENTITY_ISSUE),
    scores: {
      ...result.scores,
      factual_grounding: 1,
    },
  };
  const lengthUnderMinimum = isContentLengthIssue(guarded);

  return {
    ...guarded,
    verdict: resolveVerdict(
      guarded.scores,
      options.retryCount,
      true,
      lengthUnderMinimum,
      options.contentType,
    ),
  };
}

function parseQaResponse(
  jsonText: string,
  retryCount: number,
  options: {
    contentType: ContentType;
    hasEvents: boolean;
    hasLineups: boolean;
    language: ContentLanguage;
    matchContext: QaMatchContext;
    narrative: string;
    entityViolations?: string[];
    matchEvents?: AssembledContentInput["match_events"];
  },
): QaResult {
  const parsed = JSON.parse(jsonText) as ParsedQaResponse;

  if (!parsed.scores) {
    throw new Error("qa response missing scores");
  }

  // The QA model frequently miscounts Japanese characters and self-reports
  // the length issue on content that actually meets the minimum. The
  // deterministic guard below re-adds the issue from a real measurement, so
  // it is the single source of truth for content length.
  const llmIssues = (Array.isArray(parsed.issues) ? parsed.issues : []).filter(
    (issue) => issue !== CONTENT_LENGTH_ISSUE,
  );
  const statedPlayerStats = parseStatedPlayerStats(parsed.statedPlayerStats);
  const statedWinner = parseStatedWinner(parsed.statedWinner);

  const guarded = applyDeterministicQaGuards(
    {
      scores: parsed.scores,
      issues: llmIssues,
      verdict: "retry",
    },
    {
      ...options,
      statedPlayerStats,
      statedWinner,
    },
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
      options.contentType,
    ),
  };
}

export async function evaluateNarrativeQuality(options: {
  contentType: ContentType;
  entityViolations?: string[];
  hasEvents?: boolean;
  hasLineups?: boolean;
  language?: ContentLanguage;
  matchContext: QaMatchContext;
  matchEvents?: AssembledContentInput["match_events"];
  narrative: string;
  retryCount: number;
}): Promise<QaStageResponse> {
  const hasEvents = options.hasEvents ?? false;
  const hasLineups = options.hasLineups ?? false;
  const playerStatNames =
    options.contentType === "recap" && hasEvents
      ? buildPlayerStatPromptNames(options.matchEvents)
      : [];
  const prompt = buildQaContentPrompt(
    options.contentType,
    options.narrative,
    options.language ?? "ja",
    options.matchContext,
    hasEvents,
    playerStatNames,
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
        hasLineups,
        language: options.language ?? "ja",
        matchContext: options.matchContext,
        matchEvents: options.matchEvents,
        narrative: options.narrative,
        entityViolations: options.entityViolations,
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
