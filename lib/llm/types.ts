export type ContentType = "preview" | "recap";

export type AdditionalSignal = {
  source: "reddit" | "official_press" | "editorial";
  summary_ja: string;
  evidence_refs: string[];
};

export type TacticalPoint = {
  point: string;
  detail: string;
  evidence: string[];
};

export type FactExtractionResult = {
  tactical_points: TacticalPoint[];
};

export type QaVerdict = "publish" | "retry" | "reject";

export type QaResult = {
  scores: {
    information_density: number;
    japanese_quality: number;
    factual_grounding: number;
  };
  issues: string[];
  verdict: QaVerdict;
};

export type AssembledContentInput = {
  match: {
    id: string;
    kickoff_at: string;
    status: string;
    venue: string | null;
    competition: {
      id: string;
      name: string;
      season: string;
    } | null;
    home_team: {
      id: string;
      name: string;
      short_code: string | null;
      country: string;
    } | null;
    away_team: {
      id: string;
      name: string;
      short_code: string | null;
      country: string;
    } | null;
  };
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
    };
    away: {
      avg_points_for_last_5: number | null;
      avg_points_against_last_5: number | null;
    };
  };
};
