import { describe, expect, it } from "vitest";

import {
  buildGeneratePreviewPrompt,
  PROMPT_VERSION,
} from "@/lib/llm/prompts/generate-preview";

import type { AssembledContentInput } from "@/lib/llm/types";

const assembled: AssembledContentInput = {
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

describe("buildGeneratePreviewPrompt", () => {
  it("uses preview prompt version 1.8.0", () => {
    expect(PROMPT_VERSION).toBe("preview@1.8.0");
  });

  it("instructs the model to use final scores as the winner source", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("home_score と away_score が正確な最終スコア");
    expect(prompt).toContain("スコアが高いチームが勝者");
    expect(prompt).toContain('"home_score":null');
    expect(prompt).toContain('"away_score":null');
  });

  it("includes the minimum length instruction", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("全体で1,500字以上を目標とすること");
    expect(prompt).toContain(
      "各セクションが指定範囲の下限を下回った場合は書き足すこと",
    );
  });

  it("uses data-sparse structure when lineup and event data are unavailable", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("両チーム現状と近況(500-600字)");
    expect(prompt).toContain("大会文脈・この試合の意味(400-500字)");
    expect(prompt).toContain("戦術傾向と注目ポイント(400-500字)");
    expect(prompt).toContain("キープレイヤーセクションは省略すること");
    expect(prompt).toContain("【データスパースモード】");
    expect(prompt).toContain("recent_form の直近5試合スコア");
    expect(prompt).toContain("competition_standings の現在順位・勝ち点差");
    expect(prompt).toContain("h2h_last_5 の直近対戦傾向");
    expect(prompt).toContain("key_stats の直近平均得点・失点");
    expect(prompt).toContain("逃げ表現は一切禁止");
  });

  it("includes competition standings only when present", () => {
    const withoutStandings = buildGeneratePreviewPrompt(assembled, [], []);
    const withStandings = buildGeneratePreviewPrompt(
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
    expect(withStandings).toContain("Grand Slam");
  });

  it("switches player-name style by competition family", () => {
    const overseasPrompt = buildGeneratePreviewPrompt(assembled, [], []);
    const leagueOnePrompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        match: {
          ...assembled.match,
          competition: {
            family: "league-one",
            id: "competition-1",
            name: "Japan Rugby League One 2024-25",
            season: "2024-25",
          },
        },
      },
      [],
      [],
    );

    expect(overseasPrompt).toContain("選手名は必ずカタカナで記載すること");
    expect(overseasPrompt).toContain("アルファベット表記は禁止");
    expect(overseasPrompt).toContain("Marcus Smith → マーカス・スミス");
    expect(overseasPrompt).toContain("Richie Mo'unga → リッチー・モウンガ");
    expect(overseasPrompt).toContain("Antoine Dupont → アントワーヌ・デュポン");
    expect(overseasPrompt).toContain("Siya Kolisi → シヤ・コリシ");
    expect(overseasPrompt).toContain("Finn Russell → フィン・ラッセル");
    expect(overseasPrompt).toContain(
      "Josh van der Flier → ジョシュ・ファン・デル・フリア",
    );
    expect(overseasPrompt).toContain(
      "チーム名は英語表記のまま（例: Reds、Leinster、Springboks）",
    );
    expect(leagueOnePrompt).toContain("選手名は日本語表記を使用すること");
    expect(leagueOnePrompt).toContain("外国人選手はカタカナで記載すること");
  });

  it("prevents player-name hallucination from missing lineup and event data", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain(
      "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること",
    );
    expect(prompt).toContain("データに存在しない選手名を推測・創作してはならない");
    expect(prompt).toContain("ラインアップが空の場合は選手名に言及せず");
  });
});
