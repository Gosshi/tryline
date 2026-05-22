import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractTacticalPoints } from "@/lib/llm/stages/extract-facts";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

const assembled = {
  match: {
    id: "f0b3b7ca-cf11-4b95-bec8-b04e1cb58889",
    kickoff_at: new Date().toISOString(),
    status: "scheduled",
    venue: "Tokyo",
    home_score: null,
    away_score: null,
    competition: null,
    home_team: null,
    away_team: null,
  },
  match_phase: null,
  recent_form: { home: [], away: [] },
  h2h_last_5: [],
  match_events: [],
  competition_standings: [],
  projected_lineups: { home: [], away: [] },
  injuries: { home: [], away: [] },
  key_stats: {
    home: {
      avg_points_for_last_5: null,
      avg_points_against_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    away: {
      avg_points_for_last_5: null,
      avg_points_against_last_5: null,
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
};

const tacticalPoints = [
  {
    away_situation: "直近5試合で平均17失点",
    home_situation: "直近5試合で平均31得点",
    match_impact: "high",
    matchup_implication: "ホームの速い球出しが相手防御を広げる",
    tactical_dimension: "アタック効率",
  },
  {
    away_situation: "直近3試合でラインアウト成功率80%",
    home_situation: "直近3試合でラインアウト成功率92%",
    match_impact: "medium",
    matchup_implication: "セットピース起点の地域獲得に差が出る",
    tactical_dimension: "ラインアウト精度",
  },
  {
    away_situation: "前節は後半70分以降に2失点",
    home_situation: "前節は終盤10分で10得点",
    match_impact: "low",
    matchup_implication: "終盤の得点機会でホームが圧力をかける",
    tactical_dimension: "終盤得点力",
  },
] as const;

describe("extractTacticalPoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 3 tactical points from valid JSON", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        tactical_points: tacticalPoints,
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 3000, outputTokens: 500 },
    });

    const result = await extractTacticalPoints(assembled);

    expect(result.result.tactical_points).toHaveLength(3);
    expect(result.attempts).toBe(1);
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("tactical_dimension"),
        jsonMode: true,
      }),
    );
  });

  it("retries once when first response is invalid JSON", async () => {
    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: "not json",
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 100, outputTokens: 100 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: tacticalPoints,
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 100, outputTokens: 100 },
      });

    const result = await extractTacticalPoints(assembled);

    expect(result.attempts).toBe(2);
    expect(openAIMock.createTextResponse).toHaveBeenCalledTimes(2);
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });
});
