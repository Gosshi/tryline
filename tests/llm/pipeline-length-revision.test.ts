import { beforeEach, describe, expect, it, vi } from "vitest";

const assembleMock = vi.hoisted(() => ({
  assembleMatchContentInput: vi.fn(),
}));

const extractFactsMock = vi.hoisted(() => ({
  extractTacticalPoints: vi.fn(),
}));

const generateNarrativeMock = vi.hoisted(() => ({
  generateNarrative: vi.fn(),
  NARRATIVE_TEMPERATURE_SEQUENCE: [0.7, 0.9, 0.4],
  reviseNarrativeLength: vi.fn(),
}));

const qaMock = vi.hoisted(() => ({
  DENSITY_PUBLISH_MIN: 4,
  evaluateNarrativeQuality: vi.fn(),
  isContentLengthIssue: vi.fn((result: { issues: string[] }) =>
    result.issues.includes("本文が目標字数の下限未満です"),
  ),
  isFactualGroundingHardBlock: vi.fn(
    (result: { issues: string[]; scores: { factual_grounding: number } }) =>
      result.scores.factual_grounding <= 2 ||
      result.issues.includes("データに存在しない統計値を含む"),
  ),
}));

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));
vi.mock("@/lib/llm/stages/assemble", () => assembleMock);
vi.mock("@/lib/llm/stages/extract-facts", () => extractFactsMock);
vi.mock("@/lib/llm/stages/generate-narrative", () => generateNarrativeMock);
vi.mock("@/lib/llm/stages/qa", () => qaMock);
vi.mock("@/lib/llm/notify", () => ({
  notifyContentRejected: vi.fn(),
  notifyCostAlert: vi.fn(),
}));
vi.mock("@/lib/seo/indexnow", () => ({
  submitUrlsToIndexNow: vi.fn(),
}));

import { generateMatchContent } from "@/lib/llm/pipeline";

import type { AssembledContentInput } from "@/lib/llm/types";

const assembled: AssembledContentInput = {
  competition_standings: [],
  h2h_last_5: [],
  injuries: { away: [], home: [] },
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
    away_score: null,
    away_team: null,
    competition: null,
    home_score: null,
    home_team: null,
    id: "match-1",
    kickoff_at: "2026-01-01T00:00:00.000Z",
    status: "scheduled",
    venue: null,
  },
  match_events: [],
  match_phase: null,
  projected_lineups: { away: [], home: [] },
  recent_form: { away: [], home: [] },
  score_timeline: null,
  sourced_facts: [],
};

const qaScores = {
  factual_grounding: 5,
  information_density: 5,
  japanese_quality: 5,
  tactical_depth: 5,
};
const assembledWithEvents: AssembledContentInput = {
  ...assembled,
  match: {
    ...assembled.match,
    away_score: 17,
    home_score: 24,
    status: "finished",
  },
  match_events: [
    {
      minute: 12,
      player_name: "Player One",
      team_name: "Home",
      type: "try",
    },
  ],
};

describe("generateMatchContent length revision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.insert.mockResolvedValue({ error: null });
    dbMock.upsert.mockResolvedValue({ error: null });
    dbMock.from.mockReturnValue({
      insert: dbMock.insert,
      upsert: dbMock.upsert,
    });
    assembleMock.assembleMatchContentInput.mockResolvedValue(assembled);
    extractFactsMock.extractTacticalPoints.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: { tactical_points: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.generateNarrative.mockResolvedValue({
      content: "# short",
      modelVersion: "gpt-4o",
      promptVersion: "preview@3.3.0",
      temperature: 0.7,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.reviseNarrativeLength.mockResolvedValue({
      content: `# revised\n${"あ".repeat(1500)}`,
      modelVersion: "gpt-4o",
      promptVersion: "preview@3.3.0+length-revision@1.0.0",
      temperature: 0.6,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  it("revises short Japanese content once before publishing", async () => {
    qaMock.evaluateNarrativeQuality
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: { ...qaScores, information_density: 2 },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: [],
          scores: qaScores,
          verdict: "publish",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const result = await generateMatchContent("match-1", "preview", "ja");

    expect(result.status).toBe("published");
    expect(generateNarrativeMock.reviseNarrativeLength).toHaveBeenCalledTimes(1);
    expect(qaMock.evaluateNarrativeQuality).toHaveBeenCalledTimes(2);
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_md: expect.stringContaining("# revised"),
        prompt_version: "preview@3.3.0+length-revision@1.0.0",
        status: "published",
      }),
      expect.any(Object),
    );
  });

  it("publishes with warning after the single length revision remains short", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    generateNarrativeMock.reviseNarrativeLength.mockResolvedValue({
      content: "# still short",
      modelVersion: "gpt-4o",
      promptVersion: "preview@3.3.0+length-revision@1.0.0",
      temperature: 0.6,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    qaMock.evaluateNarrativeQuality
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: { ...qaScores, information_density: 2 },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: { ...qaScores, information_density: 2 },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const result = await generateMatchContent("match-1", "preview", "ja");

    expect(result.status).toBe("published");
    expect(result.qa?.issues).toContain(
      "字数下限未達のまま加筆リトライ上限に到達しました",
    );
    expect(generateNarrativeMock.reviseNarrativeLength).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[content-pipeline] publishing below length minimum",
      expect.objectContaining({ language: "ja", matchId: "match-1" }),
    );
    warnSpy.mockRestore();
  });

  it("keeps the short baseline when length revision lowers factual grounding", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    qaMock.evaluateNarrativeQuality
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: {
            ...qaScores,
            factual_grounding: 4,
            information_density: 2,
          },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["データに存在しない統計値を含む"],
          scores: {
            ...qaScores,
            factual_grounding: 1,
          },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const result = await generateMatchContent("match-1", "preview", "ja");

    expect(result.status).toBe("published");
    expect(result.qa?.scores.factual_grounding).toBe(4);
    expect(result.qa?.issues).toContain(
      "加筆リトライで事実根拠が低下したため短い正確な版を採用しました",
    );
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_md: "# short",
        prompt_version: "preview@3.3.0",
        status: "published",
      }),
      expect.any(Object),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[content-pipeline] discarded length revision with weaker factual grounding",
      expect.objectContaining({
        baselineFactual: 4,
        language: "ja",
        matchId: "match-1",
        revisionFactual: 1,
      }),
    );
    warnSpy.mockRestore();
  });

  it("keeps low-density recap factual fallback as draft", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assembleMock.assembleMatchContentInput.mockResolvedValue(assembledWithEvents);
    qaMock.evaluateNarrativeQuality
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: {
            ...qaScores,
            factual_grounding: 4,
            information_density: 3,
          },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["データに存在しない統計値を含む"],
          scores: {
            ...qaScores,
            factual_grounding: 1,
            information_density: 5,
          },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const result = await generateMatchContent("match-1", "recap", "ja");

    expect(result.status).toBe("draft");
    expect(result.qa?.scores.information_density).toBe(3);
    expect(result.qa?.issues).toContain(
      "加筆リトライで事実根拠が低下したため短い正確な版を採用しました",
    );
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_md: "# short",
        status: "draft",
      }),
      expect.any(Object),
    );
    warnSpy.mockRestore();
  });

  it("keeps low-density recap length fallback as draft", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assembleMock.assembleMatchContentInput.mockResolvedValue(assembledWithEvents);
    generateNarrativeMock.reviseNarrativeLength.mockResolvedValue({
      content: "# still short",
      modelVersion: "gpt-4o",
      promptVersion: "preview@3.3.0+length-revision@1.0.0",
      temperature: 0.6,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    qaMock.evaluateNarrativeQuality
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: { ...qaScores, information_density: 3 },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["本文が目標字数の下限未満です"],
          scores: { ...qaScores, information_density: 3 },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const result = await generateMatchContent("match-1", "recap", "ja");

    expect(result.status).toBe("draft");
    expect(result.qa?.issues).toContain(
      "字数下限未達のまま加筆リトライ上限に到達しました",
    );
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
      expect.any(Object),
    );
    warnSpy.mockRestore();
  });

  it("does not run length revision when the baseline has a factual hard block", async () => {
    qaMock.evaluateNarrativeQuality
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: [
            "本文が目標字数の下限未満です",
            "データに存在しない統計値を含む",
          ],
          scores: {
            ...qaScores,
            factual_grounding: 1,
            information_density: 2,
          },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["データに存在しない統計値を含む"],
          scores: {
            ...qaScores,
            factual_grounding: 1,
          },
          verdict: "retry",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        modelVersion: "gpt-4o-mini",
        result: {
          issues: ["データに存在しない統計値を含む"],
          scores: {
            ...qaScores,
            factual_grounding: 1,
          },
          verdict: "reject",
        },
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const result = await generateMatchContent("match-1", "preview", "ja");

    expect(result.status).toBe("draft");
    expect(result.qa?.verdict).toBe("reject");
    expect(generateNarrativeMock.reviseNarrativeLength).not.toHaveBeenCalled();
  });
});
