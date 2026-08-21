import { describe, expect, it } from "vitest";

import {
  buildQaContentPrompt,
  PROMPT_VERSION,
  type QaMatchContext,
} from "@/lib/llm/prompts/qa-content";

const matchContext: QaMatchContext = {
  awayScore: 17,
  awayTeam: "France",
  homeScore: 24,
  homeTeam: "Ireland",
};

describe("buildQaContentPrompt", () => {
  it("uses qa prompt version 2.9.0", () => {
    expect(PROMPT_VERSION).toBe("qa@2.9.0");
  });

  it("uses preview length thresholds in the information density rubric", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", matchContext);

    expect(prompt).toContain("### information_density (1-5)");
    expect(prompt).toContain("- 5: 1500字以上");
    expect(prompt).toContain("- 4: 1500字以上");
    expect(prompt).toContain("- 3: 1125字以上");
    expect(prompt).toContain("- 2: 750字未満");
    expect(prompt).toContain("## 字数ゲート");
    expect(prompt).toContain("本文が1500字未満の場合");
    expect(prompt).toContain("### tactical_depth (1-5)");
    expect(prompt).toContain("一般論が皆無");
    expect(prompt).not.toContain("verdict判定");
    expect(prompt).not.toContain('"verdict"');
  });

  it("uses English word thresholds without Japanese character targets", () => {
    const prompt = buildQaContentPrompt("preview", "Body", "en", matchContext);

    expect(prompt).toContain("- 5: 550 words以上");
    expect(prompt).toContain("本文が550 words未満の場合");
    expect(prompt).not.toContain("- 5: 1500字以上");
  });

  it("uses lower English recap word thresholds", () => {
    const prompt = buildQaContentPrompt("recap", "Body", "en", matchContext);

    expect(prompt).toContain("- 5: 600 words以上");
    expect(prompt).toContain("本文が600 words未満の場合");
    expect(prompt).not.toContain("- 5: 1200字以上");
  });

  it("uses recap length thresholds in the information density rubric", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", matchContext);

    expect(prompt).toContain("- 5: 1200字以上");
    expect(prompt).toContain("- 4: 1200字以上");
    expect(prompt).toContain("- 3: 900字以上");
    expect(prompt).toContain("- 2: 600字未満");
  });

  it("rewards Japanese recaps that adopt relevant sourced facts", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [
        {
          confidence: "high",
          fact: "Ireland won their last three matches.",
          source_domain: "irishrugby.ie",
          source_url: "https://www.irishrugby.ie/news/form",
        },
        {
          confidence: "medium",
          fact: "France changed their starting fly-half.",
          source_domain: "ffr.fr",
          source_url: "https://www.ffr.fr/news/team",
        },
      ],
      teamStats: {
        away: { possession_pct: 44 },
        home: { possession_pct: 56 },
      },
    });

    expect(prompt).toContain("反映候補となる sourced_facts は 2 件");
    expect(prompt).toContain("おおむね7割以上");
    expect(prompt).toContain("sourced_facts の反映が一部にとどまる");
    expect(prompt).toContain("主要な数値の活用");
  });

  it("does not penalize Japanese recaps without sourced facts", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [],
    });

    expect(prompt).toContain("sourced_facts は0件");
    expect(prompt).toContain("反映度で下げず");
    expect(prompt).not.toContain("おおむね7割以上");
  });

  it("rewards Japanese previews that adopt relevant sourced facts", () => {
    const previewPrompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [
        {
          confidence: "high",
          fact: "Ireland won their last three matches.",
          source_domain: "irishrugby.ie",
          source_url: "https://www.irishrugby.ie/news/form",
        },
      ],
    });
    const englishRecapPrompt = buildQaContentPrompt("recap", "Body", "en", {
      ...matchContext,
      sourcedFacts: [
        {
          confidence: "high",
          fact: "Ireland won their last three matches.",
          source_domain: "irishrugby.ie",
          source_url: "https://www.irishrugby.ie/news/form",
        },
      ],
    });

    expect(previewPrompt).toContain("## preview sourced_facts 反映度チェック");
    expect(previewPrompt).toContain("反映候補となる sourced_facts は 1 件");
    expect(previewPrompt).toContain("おおむね7割以上");
    expect(previewPrompt).toContain("sourced_facts の反映が一部にとどまる");
    expect(previewPrompt).toContain(
      "背番号と実名を根拠なく並べただけのラインアップ羅列",
    );
    expect(englishRecapPrompt).not.toContain("recap sourced_facts 反映度チェック");
  });

  it("does not penalize Japanese previews without sourced facts", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [],
    });

    expect(prompt).toContain("## preview sourced_facts 反映度チェック");
    expect(prompt).toContain("sourced_facts は0件");
    expect(prompt).toContain("反映度で下げず");
    expect(prompt).not.toContain("おおむね7割以上");
  });

  it("adds winner consistency checks only for recaps", () => {
    const recapPrompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
    );
    const previewPrompt = buildQaContentPrompt(
      "preview",
      "本文",
      "ja",
      matchContext,
    );

    expect(recapPrompt).toContain("## 勝者整合性チェック");
    expect(recapPrompt).toContain("Ireland 24 — France 17");
    expect(recapPrompt).toContain("statedWinner");
    expect(recapPrompt).toContain("正誤判定をしない");
    expect(recapPrompt).toContain("スコアとの照合はプログラム側で行う");
    expect(recapPrompt).toContain('"statedWinner":"home"|"away"|"unclear"');
    expect(previewPrompt).not.toContain("## 勝者整合性チェック");
  });

  it("omits winner consistency checks for recaps without scores", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      awayScore: null,
      homeScore: null,
    });

    expect(prompt).not.toContain("## 勝者整合性チェック");
  });

  it("adds turning point section checks for recaps with events", () => {
    const prompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
      true,
    );

    expect(prompt).toContain("## セクション構成チェック");
    expect(prompt).toContain("# ターニングポイント");
    expect(prompt).toContain("information_density のスコアを最大 3");
  });

  it("adds player stat extraction checks for recaps with events", () => {
    const prompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
      true,
    );

    expect(prompt).toContain("## 選手別得点統計チェック");
    expect(prompt).toContain("statedPlayerStats");
    expect(prompt).toContain("トライ数・コンバージョン成功数");
    expect(prompt).toContain("match_events との照合はプログラム側で行う");
  });

  it("adds actual scorer names for player stat extraction resolution", () => {
    const prompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
      true,
      ["Frawley", "Lucu"],
    );

    expect(prompt).toContain("実際の得点者名一覧（英語表記）");
    expect(prompt).toContain('"Frawley"');
    expect(prompt).toContain('"Lucu"');
    expect(prompt).toContain("カタカナ等の日本語表記");
    expect(prompt).toContain("対応する英語表記を選んで入れること");
    expect(prompt).toContain("確信を持って対応づけられない場合");
  });

  it("adds sourced facts as allowed grounding context", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [
        {
          confidence: "medium",
          fact: "Malcolm Marx is expected to miss the final.",
          source_domain: "rugbypass.com",
          source_url: "https://www.rugbypass.com/news/marx",
        },
      ],
    });

    expect(prompt).toContain("## sourced_facts grounding");
    expect(prompt).toContain("許可済み事実");
    expect(prompt).toContain("Malcolm Marx is expected to miss");
  });

  it("adds a zero-facts grounding warning when sourced facts are empty", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      sourcedFacts: [],
    });

    expect(prompt).toContain("sourced_facts はゼロです");
    expect(prompt).toContain("factual_grounding を 2 以下に下げること");
  });

  it("adds derived stats as allowed grounding context", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      derivedStats: {
        cards: [],
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
        scoreless_periods: [],
        scoring_runs: [
          {
            end_minute: 20,
            points: 17,
            start_minute: 10,
            team: "home",
          },
        ],
        second_half: { away_points: 7, home_points: 20 },
        try_scorers: [],
      },
    });

    expect(prompt).toContain("## derived_stats grounding");
    expect(prompt).toContain("入力データに基づく正当な記述");
    expect(prompt).toContain('"deficit_overcome":12');
  });

  it("adds official team stats as allowed grounding context", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      teamStats: {
        away: {
          possession_pct: 42,
          scrums_total: 6,
          scrums_won: 4,
        },
        home: {
          possession_pct: 58,
          scrums_total: 7,
          scrums_won: 7,
        },
      },
    });

    expect(prompt).toContain("## team_stats grounding");
    expect(prompt).toContain("公式サイトから取得した実データ");
    expect(prompt).toContain('"possession_pct":58');
  });

  it("adds match metadata as allowed grounding context", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      competitionName: "グレイテスト・ライバルリー2026",
      venue: "ケープタウン・スタジアム",
    });

    expect(prompt).toContain("## match_metadata grounding");
    expect(prompt).toContain("入力データに基づく正当な記述");
    expect(prompt).toContain('"competition_name":"グレイテスト・ライバルリー2026"');
    expect(prompt).toContain('"venue":"ケープタウン・スタジアム"');
  });

  it("omits match metadata values and block when unavailable", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      competitionName: null,
      venue: null,
    });

    expect(prompt).not.toContain("## match_metadata grounding");
  });

  it("omits unavailable individual match metadata values", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      competitionName: null,
      venue: "ケープタウン・スタジアム",
    });

    expect(prompt).toContain("## match_metadata grounding");
    expect(prompt).toContain('"venue":"ケープタウン・スタジアム"');
    expect(prompt).not.toContain('"competition_name"');
  });

  it("adds recent form records and averages as allowed grounding context", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      formStats: {
        away: {
          avg_points_against_last_5: 24.6,
          avg_points_for_last_5: 38.4,
          record_last_5: "4勝1敗",
          win_rate_last_5: 0.8,
        },
        home: {
          avg_points_against_last_5: 18.2,
          avg_points_for_last_5: 21.4,
          record_last_5: "2勝2敗1分",
          win_rate_last_5: 0.4,
        },
      },
    });

    expect(prompt).toContain("## form_stats grounding");
    expect(prompt).toContain("入力データに基づく正当な記述");
    expect(prompt).toContain('"record_last_5":"4勝1敗"');
    expect(prompt).toContain('"record_last_5":"2勝2敗1分"');
    expect(prompt).toContain('"avg_points_for_last_5":38.4');
  });

  it("omits the form stats block when no form values are available", () => {
    const prompt = buildQaContentPrompt("recap", "本文", "ja", {
      ...matchContext,
      formStats: {
        away: {
          avg_points_against_last_5: null,
          avg_points_for_last_5: null,
          record_last_5: null,
          win_rate_last_5: null,
        },
        home: {
          avg_points_against_last_5: null,
          avg_points_for_last_5: null,
          record_last_5: null,
          win_rate_last_5: null,
        },
      },
    });

    expect(prompt).not.toContain("## form_stats grounding");
  });

  it("adds individual Japanese recent-form results as grounding", () => {
    const recent_form: QaMatchContext["recent_form"] = {
      away: [
        {
          away_score: 17,
          away_team_name: "イタリア",
          home_score: 47,
          home_team_name: "ニュージーランド",
          kickoff_at: "2026-07-11T10:00:00.000Z",
          match_id: "nz-italy",
          status: "finished",
        },
        {
          away_score: 21,
          away_team_name: "アイルランド",
          home_score: 40,
          home_team_name: "ニュージーランド",
          kickoff_at: "2026-07-18T10:00:00.000Z",
          match_id: "nz-ireland",
          status: "finished",
        },
        {
          away_score: 21,
          away_team_name: "ニュージーランド",
          home_score: 38,
          home_team_name: "ストーマーズ",
          kickoff_at: "2026-08-08T10:00:00.000Z",
          match_id: "stormers-nz",
          status: "finished",
        },
        {
          away_score: 0,
          away_team_name: "ニュージーランド",
          home_score: 54,
          home_team_name: "シャークス",
          kickoff_at: "2026-08-12T10:00:00.000Z",
          match_id: "sharks-nz",
          status: "finished",
        },
        {
          away_score: 19,
          away_team_name: "ニュージーランド",
          home_score: 50,
          home_team_name: "ブルズ",
          kickoff_at: "2026-08-16T10:00:00.000Z",
          match_id: "bulls-nz",
          status: "finished",
        },
      ],
      home: [
        {
          away_score: 0,
          away_team_name: "ウェールズ",
          home_score: 43,
          home_team_name: "南アフリカ",
          kickoff_at: "2026-07-19T10:00:00.000Z",
          match_id: "sa-wales-1",
          status: "finished",
        },
        {
          away_score: 28,
          away_team_name: "スコットランド",
          home_score: 42,
          home_team_name: "南アフリカ",
          kickoff_at: "2026-07-12T10:00:00.000Z",
          match_id: "sa-scotland",
          status: "finished",
        },
        {
          away_score: 21,
          away_team_name: "イングランド",
          home_score: 45,
          home_team_name: "南アフリカ",
          kickoff_at: "2026-07-05T10:00:00.000Z",
          match_id: "sa-england",
          status: "finished",
        },
        {
          away_score: 73,
          away_team_name: "南アフリカ",
          home_score: 0,
          home_team_name: "ウェールズ",
          kickoff_at: "2025-11-30T10:00:00.000Z",
          match_id: "wales-sa",
          status: "finished",
        },
        {
          away_score: 24,
          away_team_name: "南アフリカ",
          home_score: 13,
          home_team_name: "アイルランド",
          kickoff_at: "2025-11-23T10:00:00.000Z",
          match_id: "ireland-sa",
          status: "finished",
        },
      ],
    };
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      recent_form,
    });

    expect(prompt).toContain("## recent_form grounding");
    expect(prompt).toContain("対戦相手・スコア・ホーム/アウェー");
    expect(prompt).toContain('"home_team_name":"南アフリカ"');
    expect(prompt).toContain('"away_team_name":"ニュージーランド"');
    expect(prompt).toContain('"home_score":43');
    expect(prompt).toContain('"away_score":19');
    expect(prompt).toContain('"away_team_name":"ウェールズ"');
    expect(prompt).toContain('"home_team_name":"ストーマーズ"');
  });

  it("omits individual recent-form grounding when no results are supplied", () => {
    const prompt = buildQaContentPrompt("preview", "本文", "ja", {
      ...matchContext,
      recent_form: { away: [], home: [] },
    });

    expect(prompt).not.toContain("## recent_form grounding");
    expect(prompt).not.toContain('"home_score":43');
  });

  it("omits turning point section checks when events are absent", () => {
    const prompt = buildQaContentPrompt(
      "recap",
      "本文",
      "ja",
      matchContext,
      false,
    );

    expect(prompt).not.toContain("## セクション構成チェック");
    expect(prompt).not.toContain("## 選手別得点統計チェック");
  });
});
