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
  score_timeline: null,
  derived_stats: null,
  team_stats: null,
  sourced_facts: [],
};

describe("buildGenerateRecapPrompt", () => {
  it("uses recap prompt version 4.17.0", () => {
    expect(PROMPT_VERSION).toBe("recap@4.17.0");
  });

  it("does not disclose missing system data while allowing factual limits", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("【本文でシステム内部のデータ不在を開示しない】");
    expect(prompt).toContain("「入力データ」「提供されたデータ」");
    expect(prompt).toContain(
      "「確定できない」「判定できない」「断定できない」「示されていない」",
    );
    expect(prompt).toContain(
      "根拠が足りず書けない話題は、その不在を報告せず話題自体に触れないこと",
    );
    expect(prompt).toContain(
      "得点記録など観測できる事実だけから個々の守備対応を断定できない",
    );
    expect(prompt).toContain("取材・観戦の限界として分析の射程を述べることは許容する");
  });

  it("includes the strengthened persona, core question, and prohibitions", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("国際ラグビーを20年取材");
    expect(prompt).toContain("Number やRugby World誌");
    expect(prompt).toContain("# この試合の核心");
    expect(prompt).toContain("定型句を使わず");
    expect(prompt).not.toContain("セクション0");
    expect(prompt).toContain("【絶対禁止表現");
    expect(prompt).toContain("入力データに無い統計");
    expect(prompt).toContain("「好調」");
    expect(prompt).toContain("「鍵となります」");
    expect(prompt).toContain("「〜という圧倒的なスコアで」");
    expect(prompt).toContain("「〜というスコアが示すように」");
    expect(prompt).toContain("「〜というスコアが示す通り」");
    expect(prompt).toContain("スコアの形容から文を始めるパターン");
    expect(prompt).toContain("反則数データ");
    expect(prompt).toContain("反則なし");
    expect(prompt).toContain("反則を犯さない");
    expect(prompt).toContain("クリーンなプレー");
    expect(prompt).toContain("規律あるプレー");
  });

  it("constrains the recap opening structure in all recap modes", () => {
    const sparsePrompt = buildGenerateRecapPrompt(assembled, [], []);
    const eventsPrompt = buildGenerateRecapPrompt(
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
    const lineupPrompt = buildGenerateRecapPrompt(
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

    for (const prompt of [sparsePrompt, eventsPrompt, lineupPrompt]) {
      expect(prompt).toContain("試合を決定づけた特定の瞬間");
      expect(prompt).toContain("試合前の予想との対比");
      expect(prompt).toContain("対戦構図・大会文脈における意味");
      expect(prompt).toContain("「[スコア]という[形容]で」");
      expect(prompt).toContain("「[スコア]が示すように」");
    }
  });

  it("instructs the model to use final scores as the winner source", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("home_score と away_score が正確な最終スコア");
    expect(prompt).toContain("スコアが高いチームが勝者");
    expect(prompt).toContain('"home_score":31');
    expect(prompt).toContain('"away_score":24');
  });

  it("includes a zero-facts warning when sourced_facts is empty", () => {
    const prompt = buildGenerateRecapPrompt(
      { ...assembled, sourced_facts: [] },
      [],
      [],
    );

    expect(prompt).toContain("sourced_facts: なし");
    expect(prompt).toContain("外部記事・モデル訓練データ由来");
    expect(prompt).toContain("統計・負傷・欠場・選手コメント・発言");
  });

  it("instructs the model to proactively incorporate relevant sourced facts", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        sourced_facts: [
          {
            confidence: "high",
            fact: "Ireland won their last three matches.",
            source_domain: "irishrugby.ie",
            source_url: "https://www.irishrugby.ie/news/form",
          },
        ],
      },
      [],
      [],
    );

    expect(prompt).toContain(
      "本文の趣旨に沿うものはできるだけ多く反映すること",
    );
    expect(prompt).toContain("無理にこじつけて記述してはならない");
    expect(prompt).toContain("自分の日本語で言い換えること");
  });

  it("adds official team stats when available", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        team_stats: {
          away: {
            lineouts_total: 12,
            lineouts_won: 10,
            possession_pct: 42,
          },
          home: {
            lineouts_total: 11,
            lineouts_won: 11,
            possession_pct: 58,
          },
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("【チームスタッツ team_stats】");
    expect(prompt).toContain("公式サイトから取得した実際のチームスタッツ");
    expect(prompt).toContain('"possession_pct":58');
    expect(prompt).toContain("ポゼッション率・成功率等の数値表現");
    expect(prompt).toContain("最低3種類");
    expect(prompt).toContain("両チームの具体的な数値");
    expect(prompt).toContain("一般論で終わらせず");
    expect(prompt).toContain("数値→試合中の具体的な事象→結果");
    expect(prompt).toContain(
      "入力データに存在しない具体的なプレー描写を創作してはならず",
    );
    expect(prompt).toContain("キーが存在しない項目については");
    expect(prompt).toContain("ゼロを明示的に主張してよいのは");
    expect(prompt).toContain("実際に0として明示されている場合のみ");
  });

  it("omits official team stats when unavailable", () => {
    const prompt = buildGenerateRecapPrompt(
      { ...assembled, team_stats: null },
      [],
      [],
    );

    expect(prompt).not.toContain("【チームスタッツ team_stats】");
  });

  it("uses data-sparse structure when lineup and event data are unavailable", () => {
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain("# 試合全体像");
    expect(prompt).not.toContain("# 試合全体像（550-700字）");
    expect(prompt).not.toContain("試合全体像とスコア分析");
    expect(prompt).toContain("# 大会文脈と順位への影響");
    expect(prompt).not.toContain("# 大会文脈と順位への影響（450-550字）");
    expect(prompt).toContain("# 両チームの近況と戦術傾向");
    expect(prompt).not.toContain("# 両チームの近況と戦術傾向（550-700字）");
    expect(prompt).toContain("# 次戦への示唆");
    expect(prompt).not.toContain("# 次戦への示唆（400-500字）");
    expect(prompt).toContain("見出し行には「# セクション名」のみを書くこと");
    expect(prompt).not.toContain("MOM選出と根拠");
    expect(prompt).toContain("MOM セクションは省略すること");
    expect(prompt).not.toContain("【ラインアップ実名活用】");
    expect(prompt).toContain("全体で2,000字以上を必ず満たすこと");
    expect(prompt).toContain("変更・追加・省略は禁止");
    expect(prompt).toContain("上記5つの見出し以外は絶対に追加してはならない");
    expect(prompt).toContain("# 試合概要");
    expect(prompt).toContain("# 総評");
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
      "各セクションが指定字数の**下限**を下回ってはならない",
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

    expect(prompt).toContain("# 試合全体像");
    expect(prompt).toContain(
      "# 試合全体像（550-700字）— 以下の要素をすべて含めること:",
    );
    expect(prompt).toContain("# ターニングポイント");
    expect(prompt).toContain(
      "# ターニングポイント（900-1,100字）— 以下の要素をすべて含めること:",
    );
    expect(prompt).toContain("# 次戦への示唆");
    expect(prompt).toContain(
      "# 次戦への示唆（400-500字）— 以下の要素をすべて含めること:",
    );
    expect(prompt).toContain("# この試合の核心");
    expect(prompt).toContain("# この試合の核心（150-250字）");
    expect(prompt).toContain("上記4つの見出し以外は絶対に追加してはならない");
    expect(prompt).not.toContain("MOM選出と根拠");
    expect(prompt).toContain(
      "`# MOM` は `# ターニングポイント` 末尾に統合済み",
    );
    expect(prompt).toContain("全体で2,000字以上を必ず満たすこと");
    expect(prompt).toContain("【字数目標と記述内容");
    expect(prompt).toContain("リード変化が起きた時点");
    expect(prompt).toContain("逆転を許した側の守備・戦術的崩壊");
    expect(prompt).toContain("MOM相当の内容をここに統合する");
    expect(prompt).toContain(
      "各セクションは # 見出し（H1）で開始すること。冒頭にタイトル行は不要。",
    );
    expect(prompt).not.toContain("【データスパースモード】");
    expect(prompt).toContain("# ターニングポイント` 末尾に統合済み");
  });

  it("does not hard-code playoff framing for league recaps without lineup data", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        match: {
          ...assembled.match,
          competition: {
            family: "nations-championship",
            id: "competition-1",
            name: "Nations Championship",
            season: "2026",
          },
        },
        match_events: [
          {
            type: "try",
            minute: 23,
            team_name: "Japan",
            player_name: "Kotaro Matsushima",
          },
        ],
        match_phase: "league",
      },
      [],
      [],
    );

    expect(prompt).toContain(
      "大会内での位置づけ（大会名・シーズン・順位表への影響、分かる場合はラウンド名）（80字程度）",
    );
    expect(prompt).not.toContain("プレーオフという文脈と一発勝負の重み");
    expect(prompt).not.toContain("敗者はそこでシーズン終了となる一発勝負");
  });

  it("does not hard-code playoff framing when match phase is unknown", () => {
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
        match_phase: null,
      },
      [],
      [],
    );

    expect(prompt).toContain(
      "大会内での位置づけ（大会名・シーズン・順位表への影響、分かる場合はラウンド名）（80字程度）",
    );
    expect(prompt).not.toContain("プレーオフという文脈と一発勝負の重み");
    expect(prompt).not.toContain("この試合はプレーオフ戦");
    expect(prompt).not.toContain("敗者はそこでシーズン終了となる一発勝負");
  });

  it("keeps playoff framing for playoff recaps without lineup data", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        match: {
          ...assembled.match,
          competition: {
            family: "top-14",
            id: "competition-1",
            name: "Top 14",
            season: "2025-26",
          },
        },
        match_events: [
          {
            type: "try",
            minute: 23,
            team_name: "Toulouse",
            player_name: "Antoine Dupont",
          },
        ],
        match_phase: "playoff_other",
      },
      [],
      [],
    );

    expect(prompt).toContain("プレーオフという文脈と一発勝負の重み");
    expect(prompt).toContain("この試合はプレーオフ戦");
    expect(prompt).toContain("敗者はそこでシーズン終了となる一発勝負");
  });

  it("includes the featured player section when lineup data is available", () => {
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

    expect(prompt).toContain("# 注目選手");
    expect(prompt).toContain("# MOM");
    expect(prompt).not.toContain("# MOM（300-400字）");
    expect(prompt).toContain(
      "実名を使い、この試合での貢献・プレー内容を具体的に記述する",
    );
    expect(prompt).toContain("全体で2,000字以上を必ず満たすこと");
    expect(prompt).toContain(
      "各セクションは # 見出し（H1）で開始すること。冒頭にタイトル行は不要。",
    );
  });

  it("requires real lineup names and matchups when lineup data is available", () => {
    const prompt = buildGenerateRecapPrompt(
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

    const prompt = buildGenerateRecapPrompt(promptInput, [], []);

    expect(prompt).toContain("Home Ten");
    expect(prompt).not.toContain("Alessandro Garbisi");
    expect(promptInput.projected_lineups.away).toHaveLength(1);
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

  it("includes third-place playoff recap guardrails", () => {
    const prompt = buildGenerateRecapPrompt(
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

  it("includes score timeline guidance when events and score timeline are present", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        match: {
          ...assembled.match,
          away_team: {
            country: "JPN",
            english_name: null,
            id: "away-team",
            name: "リコー",
            short_code: "RIC",
          },
          home_team: {
            country: "JPN",
            english_name: null,
            id: "home-team",
            name: "サントリー",
            short_code: "SUN",
          },
        },
        match_events: [
          {
            type: "try",
            minute: 84,
            team_name: "サントリー",
            player_name: "森川由起乙",
          },
        ],
        score_timeline: {
          final_away: 35,
          final_home: 40,
          ht_away: 10,
          ht_home: 27,
          lead_changes: [
            { away: 35, home: 33, minute: 78, new_leader: "away" },
            { away: 35, home: 38, minute: 84, new_leader: "home" },
          ],
          winning_score: {
            minute: 84,
            player: "森川由起乙",
            team: "home",
            type: "try",
          },
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("スコア推移サマリー");
    expect(prompt).toContain("前半終了時スコア: サントリー 27 — リコー 10");
    expect(prompt).toContain("78分: リコー 33—35");
    expect(prompt).toContain("84分: サントリー 38—35");
    expect(prompt).toContain(
      "勝利を決めた得点: 84分 サントリー 森川由起乙（try）",
    );
    expect(prompt).toContain("# ターニングポイントでは");
  });

  it("includes derived stats guidance when derived_stats are present", () => {
    const prompt = buildGenerateRecapPrompt(
      {
        ...assembled,
        derived_stats: {
          cards: [
            {
              minute: 50,
              opponent_points_during: 10,
              player: "Home Flanker",
              team: "home",
              type: "yellow_card",
            },
          ],
          comeback: { deficit_overcome: 12, team: "home" },
          conversions: {
            away: { attempts: 2, made: 1 },
            home: { attempts: 5, made: 4 },
          },
          max_lead: { minute: 70, points: 8, team: "home" },
          points_breakdown: {
            away: {
              conversions: 2,
              drop_goals: 0,
              penalties: 3,
              tries: 10,
            },
            home: {
              conversions: 8,
              drop_goals: 0,
              penalties: 6,
              tries: 25,
            },
          },
          scoreless_periods: [{ from_minute: 20, to_minute: 40 }],
          scoring_runs: [
            {
              end_minute: 20,
              points: 17,
              start_minute: 10,
              team: "home",
            },
          ],
          second_half: { away_points: 7, home_points: 20 },
          try_scorers: [
            {
              is_starter: true,
              jersey_number: 14,
              minute: 10,
              player: "Home Wing",
              position: "WTB",
              team: "home",
            },
          ],
        },
      },
      [],
      [],
    );

    expect(prompt).toContain("派生スタッツ derived_stats");
    expect(prompt).toContain("分数表記のみ");
    expect(prompt).toContain('"scoring_runs"');
  });

  it("omits derived stats guidance when derived_stats is null", () => {
    const prompt = buildGenerateRecapPrompt(
      { ...assembled, derived_stats: null },
      [],
      [],
    );

    expect(prompt).not.toContain("派生スタッツ derived_stats");
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
    const prompt = buildGenerateRecapPrompt(
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
    const prompt = buildGenerateRecapPrompt(assembled, [], []);

    expect(prompt).toContain(
      "選手名は入力データ（projected_lineups・match_events・sourced_facts）に含まれるものだけを使用すること",
    );
    expect(prompt).toContain(
      "データに存在しない選手名を推測・創作してはならない",
    );
    expect(prompt).toContain("ラインアップが空の場合は選手名に言及せず");
  });

  it("uses confirmed sourced-fact lineups as player reference data", () => {
    const prompt = buildGenerateRecapPrompt(
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

    expect(prompt).not.toContain("スコアラー・ラインアップデータは存在しない");
    expect(prompt).toContain("【ラインアップ実名活用】sourced_facts");
    expect(prompt).toContain("projected_lineups・match_events・sourced_facts");
    expect(prompt).not.toContain("ラインアップが空の場合は選手名に言及せず");
  });
});
