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

describe("buildGeneratePreviewPrompt", () => {
  it("uses preview prompt version 3.14.0", () => {
    expect(PROMPT_VERSION).toBe("preview@3.14.0");
  });

  it("includes the strengthened persona, core question, and prohibitions", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("国際ラグビーを20年取材");
    expect(prompt).toContain("Number やRugby World誌");
    expect(prompt).toContain("# この試合の核心");
    expect(prompt).toContain("本質的な争点");
    expect(prompt).toContain("数値・実績・文脈");
    expect(prompt).toContain("以下の指定パターンだけを使うこと");
    expect(prompt).toContain("【数値対決型で書くこと】");
    expect(prompt).not.toContain("【フォーム型で書くこと】");
    expect(prompt).not.toContain("【大会文脈型で書くこと】");
    expect(prompt).toContain("パターン名は出力しない");
    expect(prompt).toContain("【絶対禁止表現");
    expect(prompt).toContain("入力データに無い統計");
    expect(prompt).toContain("「好調」");
    expect(prompt).toContain("「鍵となります」");
    expect(prompt).toContain("試合データの kickoff_at_jst を必ず使うこと");
    expect(prompt).toContain("kickoff_at は UTC");
  });

  it("selects the form core pattern when recent streak data exists", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        key_stats: {
          ...assembled.key_stats,
          home: {
            ...assembled.key_stats.home,
            result_streak: "winning",
          },
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("【フォーム型で書くこと】");
    expect(prompt).not.toContain("【数値対決型で書くこと】");
    expect(prompt).not.toContain("【大会文脈型で書くこと】");
  });

  it("selects the competition-context core pattern for playoff matches", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        match_phase: "playoff_final",
      },
      [],
      [],
    );

    expect(prompt).toContain("【大会文脈型で書くこと】");
    expect(prompt).not.toContain("【数値対決型で書くこと】");
    expect(prompt).not.toContain("【フォーム型で書くこと】");
  });

  it("keeps numeric core pattern prompts to one deterministic axis", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);
    const numericAxes = [
      "攻撃力（平均得点）と守備力（平均失点）の対比",
      "得失点差（avg_score_diff_last_5）の対比",
      "直近5試合の勝率（win_rate_last_5）の対比",
    ];
    const includedAxes = numericAxes.filter((axis) => prompt.includes(axis));

    expect(prompt).not.toContain("以下の3パターン");
    expect(includedAxes).toHaveLength(1);
  });

  it("instructs the model to use final scores as the winner source", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("home_score と away_score が正確な最終スコア");
    expect(prompt).toContain("スコアが高いチームが勝者");
    expect(prompt).toContain('"home_score":null');
    expect(prompt).toContain('"away_score":null');
  });

  it("includes a zero-facts warning when sourced_facts is empty", () => {
    const prompt = buildGeneratePreviewPrompt(
      { ...assembled, sourced_facts: [] },
      [],
      [],
    );

    expect(prompt).toContain("sourced_facts: なし");
    expect(prompt).toContain("外部記事・モデル訓練データ由来");
  });

  it("uses sourced facts as the preview's concrete core without dropping form guidance", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        sourced_facts: [
          {
            confidence: "high",
            fact: "主将はハムストリングを負傷した。",
            source_domain: "springboks.rugby",
            source_url: "https://www.springboks.rugby/news/injury",
          },
        ],
      },
      [],
      [],
    );

    expect(prompt).toContain("本文の趣旨に沿うものはできるだけ多く反映すること");
    expect(prompt).toContain("【補強事実を軸にしたプレビュー】");
    expect(prompt).toContain("統計比較だけで本文を構成してはならない");
    expect(prompt).toContain("recent_form の直近5試合スコア");
    expect(prompt).toContain("competition_standings の現在順位・勝ち点差");
    expect(prompt).not.toContain("【データスパースモード】");
  });

  it("includes the minimum length instruction", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain("全体で1,500字以上を下限とし、下回ってはならない");
    expect(prompt).toContain(
      "各セクションが指定範囲の下限を下回った場合は、入力データにある",
    );
    expect(prompt).toContain(
      "全体が1,500字未満の場合は出力前に薄いセクションを加筆",
    );
    expect(prompt).toContain("水増し、同義反復、一般論");
  });

  it("uses data-sparse structure when lineup and event data are unavailable", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain(
      "構成: セクション0（この試合の核心）に続けて3セクション構成。",
    );
    expect(prompt).toContain(
      "文字数目安: 1セクション目500-600字、2セクション目400-500字、3セクション目400-500字。",
    );
    expect(prompt).toContain(
      "各セクションの見出し名はこの試合の特性に応じて自由に設定すること",
    );
    expect(prompt).toContain(
      "見出し行には内容を要約した具体的なタイトルのみを書くこと。",
    );
    expect(prompt).toContain(
      "「セクション1」「セクション2」「Section 1」等の連番ラベルや「セクション0」を見出しに含めてはならない。",
    );
    expect(prompt).not.toContain("1)500-600字 2)400-500字 3)400-500字");
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

  it("uses section heading guardrails when lineup data is available", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        projected_lineups: {
          confirmed: {
            away: true,
            home: true,
          },
          away: [
            {
              is_starter: true,
              jersey_number: 9,
              name: "Away Nine",
              position: "Scrum-half",
            },
          ],
          home: [
            {
              is_starter: true,
              jersey_number: 10,
              name: "Home Ten",
              position: "Fly-half",
            },
          ],
        },
      },
      [],
      [],
    );

    expect(prompt).toContain(
      "文字数目安: 1セクション目400-500字、2セクション目600-700字、3セクション目300-400字。",
    );
    expect(prompt).toContain(
      "3セクションのうち1つはキープレイヤー/注目マッチアップを扱うセクションにすること。",
    );
    expect(prompt).toContain(
      "連番ラベルや「セクション0」を見出しに含めてはならない",
    );
    expect(prompt).not.toContain("1)400-500字 2)600-700字 3)300-400字");
  });

  it("uses section heading guardrails for event-only previews", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        match_events: [
          {
            minute: 12,
            player_name: "Home Ten",
            team_name: "Home",
            type: "penalty",
          },
        ],
      },
      [],
      [],
    );

    expect(prompt).toContain(
      "文字数目安: 1セクション目400-500字、2セクション目600-700字、3セクション目300-400字。",
    );
    expect(prompt).toContain(
      "キープレイヤーセクションは省略すること（ラインアップデータなし）。",
    );
    expect(prompt).toContain(
      "連番ラベルや「セクション0」を見出しに含めてはならない",
    );
    expect(prompt).not.toContain("1)400-500字 2)600-700字 3)300-400字");
  });

  it("replaces the prior roster quota with evidence-based player mentions", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        projected_lineups: {
          confirmed: {
            away: true,
            home: true,
          },
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
    const promptBeforeRosterEnumerationFix = [
      "- projected_lineups.home から最低3名、projected_lineups.away から最低3名の実名を本文に含めること。",
    ].join("\n");

    expect(promptBeforeRosterEnumerationFix).toContain("最低3名");
    expect(prompt).not.toContain("最低3名");
    expect(prompt).toContain("背番号と実名を連続して並べる羅列");
    expect(prompt).toContain("その選手固有の根拠を必ず添えること");
    expect(prompt).toContain("実名マッチアップを最低1つ");
    expect(prompt).toContain("is_starter が false の選手");
    expect(prompt).toContain("先発扱いしないこと");
    expect(prompt).toContain(
      "projected_lineups・match_events に存在しない選手名",
    );
    expect(prompt).toContain(
      "片側のチームだけに confirmed なラインアップがある場合",
    );
    expect(prompt).not.toContain("マーカス・スミス");
  });

  it("treats roster fallback lineups as lineup-missing for preview structure", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        projected_lineups: {
          away: [
            {
              is_starter: null,
              jersey_number: null,
              name: "Ange Capuozzo",
              position: "Fullback",
            },
          ],
          confirmed: {
            away: false,
            home: false,
          },
          home: [
            {
              is_starter: null,
              jersey_number: null,
              name: "Harumichi Tatekawa",
              position: null,
            },
            {
              is_starter: null,
              jersey_number: null,
              name: "Michael Leitch",
              position: null,
            },
          ],
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("キープレイヤーセクションは省略すること");
    expect(prompt).toContain("【データスパースモード】");
    expect(prompt).not.toContain("【ラインアップ実名活用】");
    expect(prompt).not.toContain("最低3名");
  });

  it("removes unconfirmed fallback lineup names from the raw match data dump", () => {
    const promptInput: AssembledContentInput = {
      ...assembled,
      projected_lineups: {
        away: [
          {
            is_starter: null,
            jersey_number: null,
            name: "Alessandro Garbisi",
            position: "Scrum-half",
          },
          {
            is_starter: null,
            jersey_number: null,
            name: "アレッサンドロ・ガルビジ",
            position: "Scrum-half",
          },
        ],
        confirmed: {
          away: false,
          home: true,
        },
        home: [
          {
            is_starter: true,
            jersey_number: 10,
            name: "Home Ten",
            position: "Fly-half",
          },
        ],
      },
    };

    const prompt = buildGeneratePreviewPrompt(promptInput, [], []);

    expect(prompt).toContain("Home Ten");
    expect(prompt).not.toContain("Alessandro Garbisi");
    expect(prompt).not.toContain("アレッサンドロ・ガルビジ");
    expect(promptInput.projected_lineups.away).toHaveLength(2);
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

    expect(overseasPrompt).toContain(
      "日本語表記グロッサリにある場合は、入力データと表記が異なる場合も指定の漢字表記を必ず使うこと",
    );
    expect(overseasPrompt).toContain(
      "グロッサリにない選手でも、入力データ（projected_lineups・match_events・sourced_facts）に日本語表記がある場合はその表記をそのまま使い、漢字をカタカナに変換しないこと",
    );
    expect(overseasPrompt).toContain(
      "どちらにも日本語表記がない選手はカタカナで記載すること",
    );
    expect(overseasPrompt).toContain(
      "姓名の語順は入力データの表記から変えないこと",
    );
    expect(overseasPrompt).toContain("アルファベット表記は禁止");
    expect(overseasPrompt).toContain(
      "英語の人名はカタカナに変換し、姓名の間に中点（・）を入れること。",
    );
    expect(overseasPrompt).toContain("小辞、複合姓は日本語として自然な読み");
    expect(overseasPrompt).not.toContain("Marcus Smith → マーカス・スミス");
    expect(overseasPrompt).toContain(
      "チーム名・大会名は日本語表記グロッサリまたは試合データ内の日本語名を使うこと",
    );
    expect(overseasPrompt).toContain("英語表記のまま出力しないこと");
    expect(leagueOnePrompt).toContain(
      "選手名は日本語表記を使用すること。外国人選手は英語の人名をカタカナに変換し、姓名の間に中点（・）を入れること。チーム名は日本語または通称表記を使用すること。",
    );
    expect(leagueOnePrompt).not.toContain("Brodie Retallick");
  });

  it("includes a Japanese team and competition glossary when available", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        japanese_name_glossary: [
          {
            japanese: "レンスター",
            kind: "team",
            source: "Leinster",
          },
          {
            japanese: "ユナイテッド・ラグビー・チャンピオンシップ",
            kind: "competition",
            source: "URC",
          },
          {
            japanese: "石田 吉平",
            kind: "player",
            source: "Kippei Ishida",
          },
        ],
      },
      [],
      [],
    );

    expect(prompt).toContain("【日本語表記グロッサリ】");
    expect(prompt).toContain("レンスター");
    expect(prompt).toContain("ユナイテッド・ラグビー・チャンピオンシップ");
    expect(prompt).toContain("石田 吉平");
    expect(prompt).toContain("チーム名・大会名・選手名");
    expect(prompt).toContain("source の英語表記は本文に出さないこと");
  });

  it("prevents player-name hallucination from missing lineup and event data", () => {
    const prompt = buildGeneratePreviewPrompt(assembled, [], []);

    expect(prompt).toContain(
      "選手名は入力データ（projected_lineups・match_events・sourced_facts）に含まれるものだけを使用すること",
    );
    expect(prompt).toContain(
      "データに存在しない選手名を推測・創作してはならない",
    );
    expect(prompt).toContain("ラインアップが空の場合は選手名に言及せず");
  });

  it("uses confirmed sourced-fact lineups as player reference data", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        sourced_facts: [
          {
            confidence: "high",
            fact: "日本代表の先発は1 岡部崇人、2 江良颯、3 竹内柊平。",
            source_domain: "rugby-japan.jp",
            source_url: "https://www.rugby-japan.jp/match/30035",
          },
        ],
      },
      [],
      [],
    );

    expect(prompt).not.toContain("ラインアップデータは存在しない");
    expect(prompt).not.toContain("キープレイヤーセクションは省略すること");
    expect(prompt).toContain("【ラインアップ実名活用】sourced_facts");
    expect(prompt).toContain("片側のチームだけにラインアップ fact がある場合");
    expect(prompt).not.toContain("ラインアップが空の場合は選手名に言及せず");
  });

  it("includes sourced facts with paraphrase and grounding guardrails", () => {
    const prompt = buildGeneratePreviewPrompt(
      {
        ...assembled,
        sourced_facts: [
          {
            confidence: "high",
            fact: "Malcolm Marx is expected to miss the final through injury.",
            source_domain: "rugbypass.com",
            source_url: "https://www.rugbypass.com/news/marx",
          },
        ],
      },
      [],
      [],
    );

    expect(prompt).toContain("【出典付き補強事実 sourced_facts】");
    expect(prompt).toContain("Malcolm Marx is expected to miss");
    expect(prompt).toContain("自分の日本語で言い換えること");
    expect(prompt).toContain("sourced_facts に含まれないWeb由来");
  });
});
