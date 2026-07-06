export type MatchEventPointInput = {
  is_penalty_try?: boolean;
  isPenaltyTry?: boolean;
  type: string;
};

const PENALTY_TRY_POINTS = 7;
const TRY_POINTS = 5;

export function pointsForMatchEvent(event: MatchEventPointInput): number {
  if (event.type === "try") {
    return event.is_penalty_try === true || event.isPenaltyTry === true
      ? PENALTY_TRY_POINTS
      : TRY_POINTS;
  }

  if (event.type === "conversion") return 2;
  if (
    event.type === "penalty" ||
    event.type === "penalty_goal" ||
    event.type === "drop_goal"
  ) {
    return 3;
  }

  return 0;
}
