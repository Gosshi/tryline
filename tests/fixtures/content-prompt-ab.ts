import type { AssembledContentInput, TacticalPoint } from "@/lib/llm/types";

export const tacticalPoints: TacticalPoint[] = [
  {
    tactical_dimension: "set_piece",
    home_situation: "ホームの状況",
    away_situation: "アウェーの状況",
    matchup_implication: "対戦上の含意",
    match_impact: "medium",
  },
];

export function makeAssembled(overrides: Partial<AssembledContentInput> = {}): AssembledContentInput {
  return {
    match: {
      id: "baseline-match",
      kickoff_at: "2026-01-01T00:00:00.000Z",
      kickoff_at_jst: "2026-01-01 (木) 09:00 JST",
      status: "finished",
      venue: "東京",
      home_score: 24,
      away_score: 17,
      competition: {
        family: "premiership",
        id: "competition",
        name: "Premiership",
        name_ja: "プレミアシップ",
        season: "2025-26",
      },
      home_team: {
        id: "home",
        name: "Harlequins",
        name_ja: "ハーレクインズ",
        english_name: "Harlequins",
        short_code: "HAR",
        country: "England",
      },
      away_team: {
        id: "away",
        name: "Bath",
        name_ja: "バース",
        english_name: "Bath Rugby",
        short_code: "BAT",
        country: "England",
      },
    },
    match_phase: null,
    recent_form: { home: [], away: [] },
    h2h_last_5: [],
    match_events: [
      { type: "try", minute: 65, team_name: "Harlequins", player_name: "選手A" },
    ],
    competition_standings: [],
    projected_lineups: {
      home: [{ name: "選手A", position: "FB", jersey_number: 15, is_starter: true }],
      away: [{ name: "未確定選手", position: "10", jersey_number: 10, is_starter: true }],
      confirmed: { home: true, away: false },
    },
    injuries: { home: [], away: [] },
    key_stats: {
      home: { avg_points_for_last_5: 25, avg_points_against_last_5: 18, avg_score_diff_last_5: 7, result_streak: "winning", games_counted: 0, wins: 0, losses: 0, draws: 0, current_streak: null, win_rate_last_5: 0.8 },
      away: { avg_points_for_last_5: 21, avg_points_against_last_5: 24, avg_score_diff_last_5: -3, result_streak: "mixed", games_counted: 0, wins: 0, losses: 0, draws: 0, current_streak: null, win_rate_last_5: 0.4 },
      match: { penalty_goal_count: { home: 4, away: 6 }, try_count: { home: 3, away: 2 }, late_scoring: true },
    },
    score_timeline: null,
    derived_stats: null,
    team_stats: null,
    sourced_facts: [],
    japanese_name_glossary: [
      { kind: "player", source: "Player A", japanese: "選手A" },
    ],
    ...overrides,
  };
}

const lineup = { name: "選手A", position: "FB", jersey_number: 15, is_starter: true };

export const cases = {
  preview: {
    assembled: makeAssembled({ match: { ...makeAssembled().match, status: "scheduled", home_score: null, away_score: null } }),
    contentType: "preview" as const,
  },
  recap_lineups: {
    assembled: makeAssembled({ projected_lineups: { home: [lineup], away: [lineup], confirmed: { home: true, away: true } }, sourced_facts: [{ fact: "確定した事実", source_url: "https://example.test", source_domain: "example.test", confidence: "high" }] }),
    contentType: "recap" as const,
  },
  recap_sparse: {
    assembled: makeAssembled({ match_events: [], projected_lineups: { home: [], away: [], confirmed: { home: false, away: false } } }),
    contentType: "recap" as const,
  },
  recap_events_only: {
    assembled: makeAssembled({ projected_lineups: { home: [], away: [], confirmed: { home: false, away: false } } }),
    contentType: "recap" as const,
  },
};
