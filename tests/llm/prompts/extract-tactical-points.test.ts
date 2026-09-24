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
      result_streak: null, games_counted: 0, wins: 0, losses: 0, draws: 0, current_streak: null,
      win_rate_last_5: null,
    },
    home: {
      avg_points_against_last_5: null,
      avg_points_for_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null, games_counted: 0, wins: 0, losses: 0, draws: 0, current_streak: null,
      win_rate_last_5: null,
    },
    match: {
      late_scoring: false,
      penalty_goal_count: { away: 0, home: 0 },
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
    kickoff_at_jst: "2026-05-23 (土) 09:00 JST",
    status: "scheduled",
    venue: null,
  },
  match_events: [],
  match_phase: null,
  projected_lineups: { away: [], home: [] },
  recent_form: { away: [], home: [] },
  score_timeline: null,
  derived_stats: null,
  team_stats: null,
  sourced_facts: [],
};

describe("buildExtractTacticalPointsPrompt", () => {
  it("uses extract prompt version 2.5.0", () => {
    expect(PROMPT_VERSION).toBe("extract@2.5.0");
  });

  it("instructs extraction to use supplied result counts without recalculating", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);

    expect(prompt).toContain("【数値の扱い】");
    expect(prompt).toContain("recent_form から数え直さない");
    expect(prompt).toContain("5 未満なら「直近◯試合」と実際の数を書く");
    expect(prompt).toContain("自分で計算して書かない");
  });

  it("documents variable tactical point counts", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);

    expect(prompt).toContain("出力件数の目安");
    expect(prompt).toContain("4〜5件");
    expect(prompt).toContain("3件");
    expect(prompt).toContain("2件");
    expect(prompt).toContain("でたらめに埋めないこと");
  });

  it("describes successful penalty goals without implying penalty counts", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);

    expect(prompt).toContain(
      "得点手段の偏り（key_stats.match.try_count と penalty_goal_count。penalty_goal_count は成功したペナルティゴールの本数で、反則数ではない）",
    );
    expect(prompt).not.toContain("規律と反則傾向");
  });

  it("documents match_impact criteria", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);

    expect(prompt).toContain("【match_impact 判断基準】");
    expect(prompt).toContain("high = 大会優勝・降格・プレーオフ進出");
    expect(prompt).toContain("medium = 順位に影響するが決定的ではない");
    expect(prompt).toContain("low = 大会結果への影響が軽微");
  });

  it("keeps tactical examples limited to available input fields", () => {
    const prompt = buildExtractTacticalPointsPrompt(assembled);
    const examples =
      prompt.split("【戦術次元の例")[1]?.split("入力JSON")[0] ?? "";

    expect(examples).toContain("key_stats.avg_points_for_last_5");
    expect(examples).toContain("recent_form");
    expect(examples).toContain("competition_standings");
    expect(examples).not.toContain("成功率");
    expect(examples).not.toContain("テリトリー");
    expect(examples).not.toContain("ラインブレイク");
    expect(prompt).toContain("入力データに存在しない指標");
  });
});
