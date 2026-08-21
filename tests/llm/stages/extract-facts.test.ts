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
    kickoff_at_jst: "2026-01-01 (木) 09:00 JST",
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
  score_timeline: null,
  derived_stats: null,
  team_stats: null,
  sourced_facts: [],
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

  it("accepts variable tactical point counts from valid JSON", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        tactical_points: tacticalPoints.slice(0, 2),
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 3000, outputTokens: 500 },
    });

    const sparseResult = await extractTacticalPoints(assembled);
    expect(sparseResult.result.tactical_points).toHaveLength(2);

    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        tactical_points: [
          ...tacticalPoints,
          {
            away_situation: "直近5試合で平均9ペナルティ",
            home_situation: "直近5試合で平均6ペナルティ",
            match_impact: "medium",
            matchup_implication: "規律差が地域獲得とPG機会を左右する",
            tactical_dimension: "反則管理",
          },
          {
            away_situation: "前節は自陣22m脱出で2ミス",
            home_situation: "前節はキックリターンから2トライ",
            match_impact: "low",
            matchup_implication: "出口の精度がカウンター機会を左右する",
            tactical_dimension: "出口戦略",
          },
        ],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 3000, outputTokens: 500 },
    });

    const richResult = await extractTacticalPoints(assembled);
    expect(richResult.result.tactical_points).toHaveLength(5);
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

  it("trims large event and standings inputs before building the prompt", async () => {
    const largeInput = {
      ...assembled,
      competition_standings: Array.from({ length: 12 }, (_, index) => ({
        bonus_points_losing: 0,
        bonus_points_try: 0,
        drawn: 0,
        lost: index,
        played: 12,
        points_against: 180 + index,
        points_for: 240 + index,
        position: index + 1,
        team_name: `Team ${index + 1}`,
        total_points: 40 - index,
        tries_for: 30 + index,
        won: 12 - index,
      })),
      match_events: Array.from({ length: 45 }, (_, index) => ({
        minute: index,
        player_name: `Player ${index + 1}`,
        team_name: index % 2 === 0 ? "Home" : "Away",
        type: "try",
      })),
    };

    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        tactical_points: tacticalPoints,
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 3000, outputTokens: 500 },
    });

    await extractTacticalPoints(largeInput);

    const call = openAIMock.createTextResponse.mock.calls[0]?.[0];
    expect(call?.input).toContain("Player 40");
    expect(call?.input).not.toContain("Player 41");
    expect(call?.input).toContain("Team 10");
    expect(call?.input).not.toContain("Team 11");
  });
});
