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
};

describe("buildGeneratePreviewPrompt", () => {
  it("uses preview prompt version 3.3.0", () => {
    expect(PROMPT_VERSION).toBe("preview@3.3.0");
  });

  it("includes the strengthened persona, core question, and prohibitions", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("国際ラグビーを20年取材");
    expect(prompt).toContain("Number やRugby World誌");
    expect(prompt).toContain("# この試合の核心");
    expect(prompt).toContain("本質的な争点");
    expect(prompt).toContain("数値・実績・文脈");
    expect(prompt).toContain("【数値対決型】");
    expect(prompt).toContain("【フォーム型】");
    expect(prompt).toContain("【大会文脈型】");
    expect(prompt).toContain("パターン名は出力しない");
    expect(prompt).toContain("【絶対禁止表現");
    expect(prompt).toContain("入力データに無い統計");
    expect(prompt).toContain("「好調」");
    expect(prompt).toContain("「鍵となります」");
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

    expect(prompt).toContain(
      "全体で1,500字以上を下限とし、下回ってはならない",
    );
    expect(prompt).toContain(
      "各セクションが指定範囲の下限を下回った場合は、入力データにある",
    );
    expect(prompt).toContain("全体が1,500字未満の場合は出力前に薄いセクションを加筆");
    expect(prompt).toContain("水増し、同義反復、一般論");
  });

  it("uses data-sparse structure when lineup and event data are unavailable", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("3セクション構成（セクション0を除く）");
    expect(prompt).toContain("1)500-600字 2)400-500字 3)400-500字");
    expect(prompt).toContain(
      "各セクションの見出し名はこの試合の特性に応じて自由に設定すること",
    );
    expect(prompt).not.toContain("両チーム現状と近況(500-600字)");
    expect(prompt).not.toContain("大会文脈・この試合の意味(400-500字)");
    expect(prompt).not.toContain("戦術傾向と注目ポイント(400-500字)");
    expect(prompt).toContain("キープレイヤーセクションは省略すること");
    expect(prompt).not.toContain("【ラインアップ実名活用】");
    expect(prompt).toContain("【データスパースモード】");
    expect(prompt).toContain("recent_form の直近5試合スコア");
    expect(prompt).toContain("competition_standings の現在順位・勝ち点差");
    expect(prompt).toContain("h2h_last_5 の直近対戦傾向");
    expect(prompt).toContain("key_stats の直近平均得点・失点");
    expect(prompt).toContain("key_stats.home/away の win_rate_last_5");
    expect(prompt).toContain("key_stats.home/away の avg_score_diff_last_5");
    expect(prompt).toContain("key_stats.home/away の result_streak");
    expect(prompt).toContain("逃げ表現は一切禁止");
  });

  it("requires real lineup names and matchups when lineup data is available", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        projected_lineups: {
          away: [
            {
              is_starter: true,
              jersey_number: 9,
              name: "Away Nine",
              position: "Scrum-half",
            },
            {
              is_starter: true,
              jersey_number: 10,
              name: "Away Ten",
              position: "Fly-half",
            },
            {
              is_starter: false,
              jersey_number: 22,
              name: "Away Reserve",
              position: "Centre",
            },
          ],
          home: [
            {
              is_starter: true,
              jersey_number: 9,
              name: "Home Nine",
              position: "Scrum-half",
            },
            {
              is_starter: true,
              jersey_number: 10,
              name: "Home Ten",
              position: "Fly-half",
            },
            {
              is_starter: false,
              jersey_number: 21,
              name: "Home Reserve",
              position: "Scrum-half",
            },
          ],
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("キープレイヤー/注目マッチアップ");
    expect(prompt).toContain("【ラインアップ実名活用】");
    expect(prompt).toContain("projected_lineups.home から最低3名");
    expect(prompt).toContain("projected_lineups.away から最低3名");
    expect(prompt).toContain("実名マッチアップを最低1つ");
    expect(prompt).toContain("is_starter が false の選手");
    expect(prompt).toContain("先発扱いしないこと");
    expect(prompt).toContain(
      "projected_lineups・match_events に存在しない選手名",
    );
    expect(prompt).not.toContain("マーカス・スミス");
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

  it("includes playoff final preview context", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        match: {
          ...assembled.match,
          competition: {
            family: "premiership",
            id: "competition-1",
            name: "Premiership Rugby",
            season: "2025-26",
          },
        },
        match_phase: "playoff_final",
      },
      [],
      [],
    );

    expect(prompt).toContain("Premiership Rugby 2025-26の決勝戦");
    expect(prompt).toContain("勝者がチャンピオンとなります");
    expect(prompt).toContain("タイトル争いの文脈");
  });

  it("includes third-place playoff preview guardrails", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        match_phase: "playoff_third_place",
      },
      [],
      [],
    );

    expect(prompt).toContain("この試合は3位決定戦です");
    expect(prompt).toContain("決勝ではありません");
    expect(prompt).toContain("「決勝」「チャンピオン」「優勝」「タイトル」");
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
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain(
      "選手名は入力データ（projected_lineups・match_events）に含まれるものだけを使用すること",
    );
    expect(prompt).toContain(
      "データに存在しない選手名を推測・創作してはならない",
    );
    expect(prompt).toContain("ラインアップが空の場合は選手名に言及せず");
  });
});
