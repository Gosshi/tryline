export type ApiEnvelope<T> =
  | { data: T; error: null; success: true }
  | { data: null; error: string; success: false };

export type V1CompetitionSummary = {
  name: string;
  season: string;
  slug: string;
};

export type V1TeamSummary = {
  id: string | null;
  name: string;
  score: number | null;
  slug: string;
};

export type V1CalendarMatch = {
  away_team: V1TeamSummary;
  broadcast_jp_url: string | null;
  competition: V1CompetitionSummary;
  has_preview: boolean;
  has_recap: boolean;
  home_team: V1TeamSummary;
  id: string;
  kickoff_utc: string;
  status: string;
};

export type V1CalendarData = {
  matches: V1CalendarMatch[];
};

export type V1MatchEvent = {
  id: string;
  is_penalty_try: boolean;
  minute: number | null;
  player_name: string;
  points: number | null;
  team_id: string;
  type: string;
};

export type V1MatchLineupPlayer = {
  is_starter: boolean;
  jersey_number: number;
  player_name: string;
  player_slug: string | null;
  position: string | null;
  team_id: string;
};

export type V1MatchDetail = {
  away_team: V1TeamSummary & { english_name: string | null };
  broadcast_jp_url: string | null;
  competition: V1CompetitionSummary & { family: string };
  events: V1MatchEvent[];
  home_team: V1TeamSummary & { english_name: string | null };
  id: string;
  kickoff_utc: string;
  lineups: V1MatchLineupPlayer[];
  pool_name: string | null;
  round: number | null;
  round_name: string | null;
  status: string;
  venue: string | null;
};

export type V1MatchDetailData = {
  match: V1MatchDetail;
};

export type V1ContentItem = {
  content_md: string;
  content_type: "preview" | "recap";
  generated_at: string;
  model_version: string;
  prompt_version: string;
};

export type V1MatchContentData = {
  isPremium: boolean;
  locked: boolean;
  preview: V1ContentItem | null;
  recap: V1ContentItem | null;
};

export type V1Competition = V1CompetitionSummary & {
  end_date: string | null;
  family: string;
  match_count: number;
  start_date: string | null;
};

export type V1CompetitionsData = {
  competitions: V1Competition[];
};

export type V1Standing = {
  bonus_points_losing: number;
  bonus_points_try: number;
  drawn: number;
  lost: number;
  played: number;
  points_against: number;
  points_for: number;
  position: number;
  team_name: string;
  team_short_code: string;
  total_points: number;
  tries_for: number;
  won: number;
};

export type V1PoolStanding = {
  pool_name: string;
  standings: V1Standing[];
};

export type V1StandingsData = {
  competition: V1CompetitionSummary;
  pools: V1PoolStanding[];
  standings: V1Standing[];
};

export type V1MeData = {
  display_name: string | null;
  favorite_team_slugs: string[];
  isPremium: boolean;
};

export type V1FavoritesData = {
  favorite_team_slugs: string[];
};
