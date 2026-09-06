import type { MatchEventRow } from "@/lib/db/queries/match-events";

type FinalScoreTimeline = {
  final_away: number;
  final_home: number;
};

type EventPointTotals = {
  away: number;
  home: number;
};

type MatchFinalScore = {
  away_score: number | null;
  home_score: number | null;
};

export type ScoreTimelineEvent = {
  is_penalty_try: boolean;
  minute: number | null;
  player_name: string;
  team_name: string;
  type: string;
};

export function eventTotalsMatchFinalScore(
  scoreTimeline: FinalScoreTimeline | null,
  homeScore: number | null,
  awayScore: number | null,
): boolean;
export function eventTotalsMatchFinalScore(
  totals: EventPointTotals,
  match: MatchFinalScore,
): boolean;
export function eventTotalsMatchFinalScore(
  timelineOrTotals: FinalScoreTimeline | EventPointTotals | null,
  homeScoreOrMatch: number | MatchFinalScore | null,
  awayScore?: number | null,
): boolean {
  if (timelineOrTotals === null) {
    return false;
  }

  const finalHome =
    "final_home" in timelineOrTotals
      ? timelineOrTotals.final_home
      : timelineOrTotals.home;
  const finalAway =
    "final_away" in timelineOrTotals
      ? timelineOrTotals.final_away
      : timelineOrTotals.away;

  if (typeof homeScoreOrMatch === "object" && homeScoreOrMatch !== null) {
    return (
      homeScoreOrMatch.home_score !== null &&
      homeScoreOrMatch.away_score !== null &&
      finalHome === homeScoreOrMatch.home_score &&
      finalAway === homeScoreOrMatch.away_score
    );
  }

  return (
    homeScoreOrMatch !== null &&
    awayScore !== null &&
    finalHome === homeScoreOrMatch &&
    finalAway === awayScore
  );
}

export function toScoreTimelineEvent(
  event: MatchEventRow,
  teams: {
    away: { id: string; name: string };
    home: { id: string; name: string };
  },
): ScoreTimelineEvent {
  return {
    is_penalty_try: event.isPenaltyTry,
    minute: event.minute,
    player_name: event.playerName,
    team_name:
      event.teamId === teams.home.id
        ? teams.home.name
        : event.teamId === teams.away.id
          ? teams.away.name
          : "",
    type: event.type,
  };
}
