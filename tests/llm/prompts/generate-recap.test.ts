import { describe, expect, it } from "vitest";

import {
  buildGenerateRecapPrompt,
  PROMPT_VERSION,
} from "@/lib/llm/prompts/generate-recap";

import type { AssembledContentInput } from "@/lib/llm/types";

const assembled: AssembledContentInput = {
  match: {
    id: "f0b3b7ca-cf11-4b95-bec8-b04e1cb58889",
    kickoff_at: new Date().toISOString(),
    status: "finished",
    venue: "Tokyo",
    competition: null,
    home_team: null,
    away_team: null,
  },
  recent_form: { home: [], away: [] },
  h2h_last_5: [],
  match_events: [],
  competition_standings: [],
  projected_lineups: { home: [], away: [] },
  injuries: { home: [], away: [] },
  key_stats: {
    home: { avg_points_for_last_5: null, avg_points_against_last_5: null },
    away: { avg_points_for_last_5: null, avg_points_against_last_5: null },
  },
};

describe("buildGenerateRecapPrompt", () => {
  it("uses recap prompt version 1.4.0", () => {
    expect(PROMPT_VERSION).toBe("recap@1.4.0");
  });

  it("includes section ranges and the minimum length instruction", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("試合全体像(400-500字)");
    expect(prompt).toContain("ターニングポイント(500-600字)");
    expect(prompt).toContain("全体で2,000字以上を目標とすること");
    expect(prompt).toContain("各セクションが指定範囲の下限を下回った場合は書き足すこと");
  });

  it("includes match events only when present", () => {
    const withoutEvents = buildGenerateRecapPrompt(assembled, [], []);
    const withEvents = buildGenerateRecapPrompt(
      {
        ...assembled,
        match_events: [
          {
            type: "try",
            minute: 23,
            team_name: "England",
            player_name: "Marcus Smith",
          },
        ],
      },
      [],
      [],
    );

    expect(withoutEvents).not.toContain("スコアリングイベント");
    expect(withEvents).toContain("スコアリングイベント");
    expect(withEvents).toContain("Marcus Smith");
  });

  it("includes competition standings only when present", () => {
    const withoutStandings = buildGenerateRecapPrompt(assembled, [], []);
    const withStandings = buildGenerateRecapPrompt(
      {
        ...assembled,
        competition_standings: [
          {
            bonus_points_losing: 0,
            bonus_points_try: 1,
            drawn: 0,
            lost: 0,
            played: 3,
            points_against: 51,
            points_for: 92,
            position: 1,
            team_name: "Ireland",
            total_points: 14,
            tries_for: 10,
            won: 3,
          },
        ],
      },
      [],
      [],
    );

    expect(withoutStandings).not.toContain("現在の大会順位表");
    expect(withStandings).toContain("現在の大会順位表");
    expect(withStandings).toContain("木のスプーン");
  });
});
