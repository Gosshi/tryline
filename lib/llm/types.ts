export type ContentType = "preview" | "recap";
export type ContentLanguage = "ja" | "en";

export type AdditionalSignal = {
  source: "reddit" | "official_press" | "editorial";
  summary_ja: string;
  evidence_refs: string[];
};

export type TacticalPoint = {
  tactical_dimension: string;
  home_situation: string;
  away_situation: string;
  matchup_implication: string;
  match_impact: "high" | "medium" | "low";
};

export type MatchPhase =
  | "league"
  | "playoff_final"
  | "playoff_other"
  | "playoff_third_place"
  | "playoff_semifinal";

export type FactExtractionResult = {
  tactical_points: TacticalPoint[];
};

export type QaVerdict = "publish" | "retry" | "reject";

export type QaResult = {
  scores: {
    information_density: number;
    japanese_quality: number;
    factual_grounding: number;
    tactical_depth: number;
  };
  issues: string[];
  verdict: QaVerdict;
};

export type ScoreTimeline = {
  final_home: number;
  final_away: number;
  ht_home: number;
  ht_away: number;
  lead_changes: Array<{
    minute: number;
    home: number;
    away: number;
    new_leader: "home" | "away" | "draw";
  }>;
  winning_score: {
    minute: number;
    player: string;
    team: "home" | "away";
    type: string;
  } | null;
};

export type SourcedFactInput = {
  fact: string;
  source_url: string;
  source_domain: string;
  confidence: "high" | "medium";
};

export type AssembledContentInput = {
  match: {
    id: string;
    kickoff_at: string;
    status: string;
    venue: string | null;
    home_score: number | null;
    away_score: number | null;
    competition: {
      family: string | null;
      id: string;
      name: string;
      name_ja?: string | null;
      season: string;
      slug?: string | null;
    } | null;
    home_team: {
      id: string;
      name: string;
      name_ja?: string | null;
      english_name: string | null;
      short_code: string | null;
      slug?: string | null;
      country: string;
    } | null;
    away_team: {
      id: string;
      name: string;
      name_ja?: string | null;
      english_name: string | null;
      short_code: string | null;
      slug?: string | null;
      country: string;
    } | null;
  };
  match_phase: MatchPhase | null;
  recent_form: {
    home: Array<{
      match_id: string;
      kickoff_at: string;
      home_team_name: string;
      away_team_name: string;
      home_score: number | null;
      away_score: number | null;
      status: string;
    }>;
    away: Array<{
      match_id: string;
      kickoff_at: string;
      home_team_name: string;
      away_team_name: string;
      home_score: number | null;
      away_score: number | null;
      status: string;
    }>;
  };
  h2h_last_5: Array<{
    match_id: string;
    kickoff_at: string;
    home_team_name: string;
    away_team_name: string;
    home_score: number | null;
    away_score: number | null;
    status: string;
  }>;
  match_events: Array<{
    type: string;
    minute: number | null;
    team_name: string;
    player_name: string;
    is_penalty_try?: boolean;
  }>;
  competition_standings: Array<{
    position: number;
    team_name: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points_for: number;
    points_against: number;
    tries_for: number;
    bonus_points_try: number;
    bonus_points_losing: number;
    total_points: number;
  }>;
  projected_lineups: {
    home: Array<{
      name: string;
      position: string | null;
      jersey_number: number | null;
      is_starter: boolean | null;
    }>;
    away: Array<{
      name: string;
      position: string | null;
      jersey_number: number | null;
      is_starter: boolean | null;
    }>;
  };
  injuries: {
    home: string[];
    away: string[];
  };
  key_stats: {
    home: {
      avg_points_for_last_5: number | null;
      avg_points_against_last_5: number | null;
      win_rate_last_5: number | null;
      avg_score_diff_last_5: number | null;
      result_streak: "winning" | "losing" | "mixed" | null;
    };
    away: {
      avg_points_for_last_5: number | null;
      avg_points_against_last_5: number | null;
      win_rate_last_5: number | null;
      avg_score_diff_last_5: number | null;
      result_streak: "winning" | "losing" | "mixed" | null;
    };
    match: {
      penalty_count: { home: number; away: number };
      try_count: { home: number; away: number };
      late_scoring: boolean;
    };
  };
  score_timeline: ScoreTimeline | null;
  sourced_facts: SourcedFactInput[];
  japanese_name_glossary?: Array<{
    kind: "competition" | "team";
    source: string;
    japanese: string;
  }>;
};
