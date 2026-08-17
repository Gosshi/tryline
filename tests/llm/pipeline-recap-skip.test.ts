import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache/public-data", () => ({
  PUBLIC_DATA_CACHE_TAGS: {
    content: "public-data:content",
    matches: "public-data:matches",
  },
  revalidatePublicData: vi.fn(),
}));

const assembleMock = vi.hoisted(() => ({
  assembleMatchContentInput: vi.fn(),
  computeScoreTimeline: vi.fn(),
}));

const extractFactsMock = vi.hoisted(() => ({
  extractTacticalPoints: vi.fn(),
}));

const generateNarrativeMock = vi.hoisted(() => ({
  generateNarrative: vi.fn(),
  NARRATIVE_GENERATION_ATTEMPTS: 1,
  reviseNarrativeLength: vi.fn(),
}));

const qaMock = vi.hoisted(() => ({
  applyEntityGroundingQaGuard: vi.fn(
    (result: { verdict: string }, options: { entityViolations: string[] }) =>
      options.entityViolations.length === 0
        ? result
        : { ...result, verdict: "retry" },
  ),
  DENSITY_PUBLISH_MIN: 4,
  evaluateNarrativeQuality: vi.fn(),
  isContentLengthIssue: vi.fn(() => false),
  isFactualGroundingHardBlock: vi.fn(() => false),
}));

const verifyEntitiesMock = vi.hoisted(() => ({
  verifyNarrativeEntities: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
  upsert: vi.fn(),
}));

const indexNowMock = vi.hoisted(() => ({
  submitUrlsToIndexNow: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));

vi.mock("@/lib/llm/stages/assemble", () => assembleMock);
vi.mock("@/lib/llm/stages/extract-facts", () => extractFactsMock);
vi.mock("@/lib/llm/stages/generate-narrative", () => generateNarrativeMock);
vi.mock("@/lib/llm/stages/qa", () => qaMock);
vi.mock("@/lib/llm/stages/verify-entities", () => verifyEntitiesMock);
vi.mock("@/lib/llm/notify", () => ({
  notifyContentRejected: vi.fn(),
  notifyCostAlert: vi.fn(),
}));
vi.mock("@/lib/seo/indexnow", () => indexNowMock);

import { generateMatchContent } from "@/lib/llm/pipeline";

import type { AssembledContentInput } from "@/lib/llm/types";

const assembledWithoutEvents: AssembledContentInput = {
  competition_standings: [],
  h2h_last_5: [],
  injuries: {
    away: [],
    home: [],
  },
  key_stats: {
    away: {
      avg_points_against_last_5: null,
      avg_points_for_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    home: {
      avg_points_against_last_5: null,
      avg_points_for_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    match: {
      late_scoring: false,
      penalty_count: { away: 0, home: 0 },
      try_count: { away: 0, home: 0 },
    },
  },
  match: {
    away_score: 17,
    away_team: null,
    competition: null,
    home_score: 24,
    home_team: null,
    id: "match-1",
    kickoff_at: "2026-01-01T00:00:00.000Z",
    status: "finished",
    venue: null,
  },
  match_events: [],
  match_phase: null,
  projected_lineups: {
    away: [],
    home: [],
  },
  recent_form: {
    away: [],
    home: [],
  },
  score_timeline: null,
  derived_stats: null,
  team_stats: null,
  sourced_facts: [],
};

describe("generateMatchContent recap event guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.insert.mockResolvedValue({ error: null });
    dbMock.maybeSingle.mockResolvedValue({ data: null, error: null });
    const existingContentQuery = {
      eq: dbMock.eq,
      maybeSingle: dbMock.maybeSingle,
    };
    const recentContentQuery = {
      eq: vi.fn(),
      order: dbMock.order,
    };
    recentContentQuery.eq.mockReturnValue(recentContentQuery);
    dbMock.order.mockReturnValue({ limit: dbMock.limit });
    dbMock.limit.mockResolvedValue({ data: [], error: null });
    dbMock.eq.mockReturnValue(existingContentQuery);
    dbMock.select.mockImplementation((columns) =>
      columns === "id, content_md" ? recentContentQuery : existingContentQuery,
    );
    dbMock.upsert.mockResolvedValue({ error: null });
    dbMock.from.mockReturnValue({
      insert: dbMock.insert,
      select: dbMock.select,
      upsert: dbMock.upsert,
    });
    assembleMock.assembleMatchContentInput.mockResolvedValue(
      assembledWithoutEvents,
    );
    assembleMock.computeScoreTimeline.mockReturnValue(null);
    verifyEntitiesMock.verifyNarrativeEntities.mockResolvedValue({
      attempts: 1,
      modelVersion: "gpt-4o-mini",
      promptVersion: "entity-verification@1.0.0",
      result: { mentions: [], ungroundedSurfaces: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  it("returns skipped before any LLM stages when recap events are missing", async () => {
    const result = await generateMatchContent("match-1", "recap");

    expect(result).toEqual({
      contentType: "recap",
      matchId: "match-1",
      qa: null,
      status: "skipped",
    });
    expect(dbMock.from).toHaveBeenCalledWith("pipeline_runs");
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(extractFactsMock.extractTacticalPoints).not.toHaveBeenCalled();
    expect(generateNarrativeMock.generateNarrative).not.toHaveBeenCalled();
    expect(qaMock.evaluateNarrativeQuality).not.toHaveBeenCalled();
  });

  it("logs a score integrity warning when event totals differ from the final score", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assembleMock.assembleMatchContentInput.mockResolvedValue({
      ...assembledWithoutEvents,
      match: {
        ...assembledWithoutEvents.match,
        away_score: 0,
        home_score: 8,
        away_team: { name: "Away" },
        home_team: { name: "Home" },
      },
      match_events: [
        {
          minute: 12,
          player_name: "Player One",
          team_name: "Home",
          type: "try",
        },
      ],
    });
    assembleMock.computeScoreTimeline.mockReturnValue({
      final_away: 0,
      final_home: 5,
      ht_away: 0,
      ht_home: 5,
      lead_changes: [],
      score_progression: [],
      winning_score: null,
    });
    extractFactsMock.extractTacticalPoints.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: { tactical_points: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.generateNarrative.mockResolvedValue({
      content: "# recap",
      modelVersion: "gpt-4o",
      promptVersion: "1.0.0",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    qaMock.evaluateNarrativeQuality.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: {
        issues: [],
        scores: {
          factual_grounding: 4,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 4,
        },
        verdict: "publish",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await generateMatchContent("match-3", "recap");

    expect(warnSpy).toHaveBeenCalledWith(
      "[score-integrity] event total mismatch",
      {
        awayDelta: 0,
        homeDelta: -3,
        matchId: "match-3",
      },
    );
    expect(dbMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_type: "recap",
        match_id: "match-3",
        output: {
          awayDelta: 0,
          homeDelta: -3,
          type: "score_event_mismatch",
        },
        stage: 0,
        status: "failed",
      }),
    );

    warnSpy.mockRestore();
  });

  it("does not warn when event totals match the final score", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assembleMock.assembleMatchContentInput.mockResolvedValue({
      ...assembledWithoutEvents,
      match: {
        ...assembledWithoutEvents.match,
        away_score: 0,
        home_score: 5,
        away_team: { name: "Away" },
        home_team: { name: "Home" },
      },
      match_events: [
        {
          minute: 12,
          player_name: "Player One",
          team_name: "Home",
          type: "try",
        },
      ],
    });
    assembleMock.computeScoreTimeline.mockReturnValue({
      final_away: 0,
      final_home: 5,
      ht_away: 0,
      ht_home: 5,
      lead_changes: [],
      score_progression: [],
      winning_score: null,
    });
    extractFactsMock.extractTacticalPoints.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: { tactical_points: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.generateNarrative.mockResolvedValue({
      content: "# recap",
      modelVersion: "gpt-4o",
      promptVersion: "1.0.0",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    qaMock.evaluateNarrativeQuality.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: {
        issues: [],
        scores: {
          factual_grounding: 4,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 4,
        },
        verdict: "publish",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await generateMatchContent("match-4", "recap");

    expect(warnSpy).not.toHaveBeenCalledWith(
      "[score-integrity] event total mismatch",
      expect.anything(),
    );

    warnSpy.mockRestore();
  });

  it("submits published league-one recap urls to IndexNow after persistence", async () => {
    dbMock.maybeSingle.mockResolvedValue({
      data: { external_ids: { wikipedia_round: "3" } },
      error: null,
    });
    assembleMock.assembleMatchContentInput.mockResolvedValue({
      ...assembledWithoutEvents,
      match: {
        ...assembledWithoutEvents.match,
        competition: {
          family: "league-one",
          id: "competition-1",
          name: "Japan Rugby League One",
          season: "2025-26",
        },
      },
      match_events: [
        {
          minute: 12,
          player_name: "Player One",
          team_name: "Home",
          type: "try",
        },
      ],
    });
    extractFactsMock.extractTacticalPoints.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: { tactical_points: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.generateNarrative.mockResolvedValue({
      content: "# recap",
      modelVersion: "gpt-4o",
      promptVersion: "1.0.0",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    qaMock.evaluateNarrativeQuality.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: {
        issues: [],
        scores: {
          factual_grounding: 4,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 4,
        },
        verdict: "publish",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await generateMatchContent("match-2", "recap");

    expect(result.status).toBe("published");
    expect(dbMock.upsert).toHaveBeenCalled();
    expect(indexNowMock.submitUrlsToIndexNow).toHaveBeenCalledWith([
      "https://www.trylinerugby.com/matches/match-2",
      "https://www.trylinerugby.com/c/league-one/2025-26",
      "https://www.trylinerugby.com/c/league-one/2025-26/round/3",
      "https://www.trylinerugby.com/calendar",
      "https://www.trylinerugby.com/matches/match-2/en",
    ]);
  });

  it("keeps low-density published recap QA as draft", async () => {
    assembleMock.assembleMatchContentInput.mockResolvedValue({
      ...assembledWithoutEvents,
      match_events: [
        {
          minute: 12,
          player_name: "Player One",
          team_name: "Home",
          type: "try",
        },
      ],
    });
    extractFactsMock.extractTacticalPoints.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: { tactical_points: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.generateNarrative.mockResolvedValue({
      content: "# recap",
      modelVersion: "gpt-4o",
      promptVersion: "1.0.0",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    qaMock.evaluateNarrativeQuality.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: {
        issues: [],
        scores: {
          factual_grounding: 4,
          information_density: 3,
          japanese_quality: 4,
          tactical_depth: 4,
        },
        verdict: "publish",
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await generateMatchContent("match-3", "recap", "ja");

    expect(result.status).toBe("draft");
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
      expect.any(Object),
    );
    expect(indexNowMock.submitUrlsToIndexNow).not.toHaveBeenCalled();
  });
});
