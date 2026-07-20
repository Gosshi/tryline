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
  computeScoreTimeline: vi.fn().mockReturnValue(null),
}));

const extractFactsMock = vi.hoisted(() => ({
  extractTacticalPoints: vi.fn(),
}));

const generateNarrativeMock = vi.hoisted(() => ({
  generateNarrative: vi.fn(),
  NARRATIVE_TEMPERATURE_SEQUENCE: [0.7],
  reviseNarrativeLength: vi.fn(),
}));

const qaMock = vi.hoisted(() => ({
  applyEntityGroundingQaGuard: vi.fn((result: unknown) => result),
  DENSITY_PUBLISH_MIN: 4,
  evaluateNarrativeQuality: vi.fn(),
  isContentLengthIssue: vi.fn(() => false),
  isFactualGroundingHardBlock: vi.fn(() => false),
}));

const verifyEntitiesMock = vi.hoisted(() => ({
  verifyNarrativeEntities: vi.fn(),
}));

const notifyMock = vi.hoisted(() => ({
  notifyContentRejected: vi.fn(),
  notifyCostAlert: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  eq: vi.fn(),
  existingContent: null as Record<string, unknown> | null,
  from: vi.fn(),
  insert: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));
vi.mock("@/lib/llm/stages/assemble", () => assembleMock);
vi.mock("@/lib/llm/stages/extract-facts", () => extractFactsMock);
vi.mock("@/lib/llm/stages/generate-narrative", () => generateNarrativeMock);
vi.mock("@/lib/llm/stages/qa", () => qaMock);
vi.mock("@/lib/llm/stages/verify-entities", () => verifyEntitiesMock);
vi.mock("@/lib/llm/notify", () => notifyMock);
vi.mock("@/lib/seo/indexnow", () => ({
  submitUrlsToIndexNow: vi.fn(),
}));

import { generateMatchContent } from "@/lib/llm/pipeline";

import type { AssembledContentInput, ContentLanguage, ContentType } from "@/lib/llm/types";

const rejectedNarrative = `# rejected\n${"あ".repeat(700)}`;

const assembled: AssembledContentInput = {
  competition_standings: [],
  derived_stats: null,
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
  projected_lineups: { away: [], home: [] },
  recent_form: { away: [], home: [] },
  score_timeline: null,
  sourced_facts: [],
  team_stats: null,
};

const qaScores = {
  factual_grounding: 3,
  information_density: 2,
  japanese_quality: 3,
  tactical_depth: 3,
};

function qaResult(
  verdict: "publish" | "reject",
  overrides: Partial<typeof qaScores> = {},
) {
  return {
    modelVersion: "gpt-4o-mini",
    result: {
      issues: ["本文が目標字数の下限未満です"],
      scores: { ...qaScores, ...overrides },
      verdict,
    },
    usage: { inputTokens: 1, outputTokens: 1 },
  };
}

function setAssembledContent(contentType: ContentType) {
  assembleMock.assembleMatchContentInput.mockResolvedValue({
    ...assembled,
    match_events:
      contentType === "recap"
        ? [
            {
              minute: 12,
              player_name: "Player One",
              team_name: "Home",
              type: "try",
            },
          ]
        : [],
  });
}

describe("generateMatchContent published preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.existingContent = null;
    dbMock.insert.mockResolvedValue({ error: null });
    dbMock.maybeSingle.mockImplementation(async () => ({
      data: dbMock.existingContent,
      error: null,
    }));
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
    dbMock.upsert.mockImplementation(async (content) => {
      dbMock.existingContent = content as Record<string, unknown>;
      return { error: null };
    });
    dbMock.from.mockImplementation((table) =>
      table === "match_content"
        ? { select: dbMock.select, upsert: dbMock.upsert }
        : { insert: dbMock.insert },
    );
    extractFactsMock.extractTacticalPoints.mockResolvedValue({
      modelVersion: "gpt-4o-mini",
      result: { tactical_points: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    generateNarrativeMock.generateNarrative.mockResolvedValue({
      content: rejectedNarrative,
      modelVersion: "gpt-4o",
      promptVersion: "test@1.0.0",
      temperature: 0.7,
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    verifyEntitiesMock.verifyNarrativeEntities.mockResolvedValue({
      attempts: 1,
      modelVersion: "gpt-4o-mini",
      promptVersion: "entity-verification@1.0.0",
      result: { mentions: [], ungroundedSurfaces: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  it.each([
    ["preview", "ja"],
    ["preview", "en"],
    ["recap", "ja"],
    ["recap", "en"],
  ] as Array<[ContentType, ContentLanguage]>)
  ("preserves existing published %s/%s content after rejection", async (contentType, language) => {
    const existingContent = {
      content_md: "# existing published",
      generated_at: "2026-07-17T12:00:00.000Z",
      qa_scores: { issues: ["existing"] },
      status: "published",
    };
    const before = structuredClone(existingContent);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    dbMock.existingContent = existingContent;
    setAssembledContent(contentType);
    qaMock.evaluateNarrativeQuality.mockResolvedValue(qaResult("reject"));

    const result = await generateMatchContent("match-1", contentType, language);

    expect(result.status).toBe("draft");
    expect(dbMock.existingContent).toEqual(before);
    expect(dbMock.upsert).not.toHaveBeenCalled();
    expect(notifyMock.notifyContentRejected).toHaveBeenCalledWith(
      "match-1",
      contentType,
      result.qa,
      {
        contentLength: Array.from(rejectedNarrative).length,
        preservedPublished: true,
      },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[content-pipeline] preserved existing published content after rejection",
      expect.objectContaining({
        contentLength: Array.from(rejectedNarrative).length,
        issues: ["本文が目標字数の下限未満です"],
        language,
      }),
    );
    warnSpy.mockRestore();
  });

  it("overwrites existing published content when QA publishes", async () => {
    dbMock.existingContent = {
      content_md: "# existing published",
      generated_at: "2026-07-17T12:00:00.000Z",
      qa_scores: { issues: ["existing"] },
      status: "published",
    };
    setAssembledContent("preview");
    qaMock.evaluateNarrativeQuality.mockResolvedValue(qaResult("publish", {
      information_density: 5,
    }));

    const result = await generateMatchContent("match-1", "preview", "ja");

    expect(result.status).toBe("published");
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_md: rejectedNarrative,
        status: "published",
      }),
      expect.any(Object),
    );
    expect(notifyMock.notifyContentRejected).not.toHaveBeenCalled();
  });

  it("inserts a draft when no existing content is present", async () => {
    setAssembledContent("preview");
    qaMock.evaluateNarrativeQuality.mockResolvedValue(qaResult("reject"));

    const result = await generateMatchContent("match-1", "preview", "ja");

    expect(result.status).toBe("draft");
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
      }),
      expect.any(Object),
    );
    expect(notifyMock.notifyContentRejected).toHaveBeenCalledWith(
      "match-1",
      "preview",
      result.qa,
    );
  });

  it("updates an existing draft for a density-blocked Japanese recap", async () => {
    dbMock.existingContent = {
      content_md: "# existing draft",
      generated_at: "2026-07-17T12:00:00.000Z",
      qa_scores: { issues: ["existing"] },
      status: "draft",
    };
    setAssembledContent("recap");
    qaMock.evaluateNarrativeQuality.mockResolvedValue(qaResult("publish", {
      information_density: 3,
    }));

    const result = await generateMatchContent("match-1", "recap", "ja");

    expect(result.status).toBe("draft");
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_md: rejectedNarrative,
        status: "draft",
      }),
      expect.any(Object),
    );
    expect(notifyMock.notifyContentRejected).toHaveBeenCalledWith(
      "match-1",
      "recap",
      result.qa,
    );
  });
});
