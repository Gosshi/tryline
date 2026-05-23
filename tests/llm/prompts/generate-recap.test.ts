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
    home_score: 31,
    away_score: 24,
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

describe("buildGenerateRecapPrompt", () => {
  it("uses recap prompt version 3.0.0", () => {
    expect(PROMPT_VERSION).toBe("recap@3.0.0");
  });

  it("includes the strengthened persona, core question, and prohibitions", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("国際ラグビーを20年取材");
    expect(prompt).toContain("Number やRugby World誌");
    expect(prompt).toContain("# この試合の核心");
    expect(prompt).toContain("試合前の「何 対 何の争い」");
    expect(prompt).toContain("【絶対禁止表現");
    expect(prompt).toContain("「好調」");
    expect(prompt).toContain("「鍵となります」");
  });

  it("instructs the model to use final scores as the winner source", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("home_score と away_score が正確な最終スコア");
    expect(prompt).toContain("スコアが高いチームが勝者");
    expect(prompt).toContain('"home_score":31');
    expect(prompt).toContain('"away_score":24');
  });

  it("uses data-sparse structure when lineup and event data are unavailable", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("試合全体像(500-600字)");
    expect(prompt).not.toContain("試合全体像とスコア分析");
    expect(prompt).toContain("大会文脈・順位への影響(400-500字)");
    expect(prompt).toContain("両チームの近況と戦術傾向(500-600字)");
    expect(prompt).toContain("次戦への示唆(300-400字)");
    expect(prompt).not.toContain("MOM選出と根拠");
    expect(prompt).toContain("MOM セクションは省略すること");
    expect(prompt).toContain("全体で2,000字以上を目標とすること");
    expect(prompt).toContain(
      "各セクションは # 見出し（H1）で開始すること。冒頭にタイトル行は不要。",
    );
    expect(prompt).toContain("【データスパースモード】");
    expect(prompt).toContain("recent_form の直近5試合");
    expect(prompt).toContain("competition_standings の順位変動");
    expect(prompt).toContain("h2h_last_5 の直近対戦スコア");
    expect(prompt).toContain("key_stats の直近平均得点・失点");
    expect(prompt).toContain("key_stats.match.penalty_count");
    expect(prompt).toContain("key_stats.match.try_count");
    expect(prompt).toContain("key_stats.match.late_scoring");
    expect(prompt).toContain(
      "スコアと順位変動のみを記述し、試合展開の描写は行わないこと",
    );
    expect(prompt).not.toContain("ペナルティ累積");
    expect(prompt).not.toContain("接戦の終盤");
    expect(prompt).not.toContain("逃げ表現");
    expect(prompt).toContain(
      "各セクションが指定範囲の下限を下回った場合は書き足すこと",
    );
  });

  it("omits the MOM selection section when events exist but lineup data is unavailable", () => {
    const prompt = buildGenerateRecapPrompt(
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

    expect(prompt).toContain("試合全体像(400-500字)");
    expect(prompt).toContain("ターニングポイント(500-600字)");
    expect(prompt).toContain("次戦への示唆(300-400字)");
    expect(prompt).not.toContain("MOM選出と根拠");
    expect(prompt).toContain("ラインアップデータなし");
    expect(prompt).toContain("全体で1,500字以上を目標とすること");
    expect(prompt).toContain(
      "各セクションは # 見出し（H1）で開始すること。冒頭にタイトル行は不要。",
    );
    expect(prompt).not.toContain("【データスパースモード】");
  });

  it("includes the MOM selection section when lineup data is available", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        projected_lineups: {
          away: [],
          home: [
            {
              is_starter: true,
              jersey_number: 10,
              name: "Marcus Smith",
              position: "Fly-half",
            },
          ],
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("MOM選出と根拠(300-400字)");
    expect(prompt).toContain("全体で2,000字以上を目標とすること");
    expect(prompt).toContain(
      "各セクションは # 見出し（H1）で開始すること。冒頭にタイトル行は不要。",
    );
  });

  it("includes playoff final context with the champion team", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        match: {
          ...assembled.match,
          away_score: 17,
          away_team: {
            country: "ENG",
            english_name: null,
            id: "away-team",
            name: "Sale Sharks",
            short_code: "SAL",
          },
          competition: {
            family: "premiership",
            id: "competition-1",
            name: "Premiership Rugby",
            season: "2025-26",
          },
          home_score: 28,
          home_team: {
            country: "ENG",
            english_name: null,
            id: "home-team",
            name: "Bath",
            short_code: "BAT",
          },
        },
        match_phase: "playoff_final",
      },
      [],
      [],
    );

    expect(prompt).toContain("Premiership Rugby 2025-26の決勝戦");
    expect(prompt).toContain("Bathが優勝チームとなりました");
    expect(prompt).toContain("レビュー冒頭でこの事実を明記");
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

  it("switches player-name style by competition family", () => {
    const overseasPrompt = buildGenerateRecapPrompt(assembled, [], []);
    const leagueOnePrompt = buildGenerateRecapPrompt(
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
    expect(overseasPrompt).toContain(
      "英語の人名はカタカナに変換し、姓名の間に中点（・）を入れること。",
    );
    expect(overseasPrompt).toContain("小辞、複合姓は日本語として自然な読み");
    expect(overseasPrompt).not.toContain("Marcus Smith → マーカス・スミス");
    expect(overseasPrompt).toContain(
      "チーム名は英語表記のまま（例: Reds、Leinster、Springboks）",
    );
    expect(leagueOnePrompt).toContain("選手名は日本語表記を使用すること");
    expect(leagueOnePrompt).toContain("外国人選手は英語の人名をカタカナに変換");
    expect(leagueOnePrompt).not.toContain("Brodie Retallick");
  });

  it("prevents player-name hallucination from missing lineup and event data", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain(
      "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること",
    );
    expect(prompt).toContain(
      "データに存在しない選手名を推測・創作してはならない",
    );
    expect(prompt).toContain("ラインアップが空の場合は選手名に言及せず");
  });
});