import { describe, expect, it } from "vitest";

import {
  buildExtractTacticalPointsPrompt,
  PROMPT_VERSION,
} from "@/lib/llm/prompts/extract-tactical-points";

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
    kickoff_at: "2026-05-23T00:00:00.000Z",
    status: "scheduled",
    venue: null,
  },
  match_events: [],
  match_phase: null,
  projected_lineups: { away: [], home: [] },
  recent_form: { away: [], home: [] },
};

describe("buildExtractTacticalPointsPrompt", () => {
  it("uses extract prompt version 2.2.0", () => {
    expect(PROMPT_VERSION).toBe("extract@2.2.0");
  });

  it("documents variable tactical point counts", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);

    expect(prompt).toContain("出力件数の目安");
    expect(prompt).toContain("4〜5件");
    expect(prompt).toContain("3件");
    expect(prompt).toContain("2件");
    expect(prompt).toContain("でたらめに埋めないこと");
  });

  it("documents match_impact criteria", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);

    expect(prompt).toContain("【match_impact 判断基準】");
    expect(prompt).toContain("high = 大会優勝・降格・プレーオフ進出");
    expect(prompt).toContain("medium = 順位に影響するが決定的ではない");
    expect(prompt).toContain("low = 大会結果への影響が軽微");
  });
});