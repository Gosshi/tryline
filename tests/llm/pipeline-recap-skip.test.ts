import { beforeEach, describe, expect, it, vi } from "vitest";

const assembleMock = vi.hoisted(() => ({
  assembleMatchContentInput: vi.fn(),
}));

const extractFactsMock = vi.hoisted(() => ({
  extractTacticalPoints: vi.fn(),
}));

const generateNarrativeMock = vi.hoisted(() => ({
  generateNarrative: vi.fn(),
  NARRATIVE_TEMPERATURE_SEQUENCE: [0.7],
}));

const qaMock = vi.hoisted(() => ({
  evaluateNarrativeQuality: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
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
};

describe("generateMatchContent recap event guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.from.mockReturnValue({
      insert: dbMock.insert.mockResolvedValue({ error: null }),
    });
    assembleMock.assembleMatchContentInput.mockResolvedValue(
      assembledWithoutEvents,
    );
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
});
