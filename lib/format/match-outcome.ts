export type MatchOutcome = "home_win" | "away_win" | "draw" | "unknown";

type MatchWithScores = {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};

export function getMatchOutcome(match: MatchWithScores): MatchOutcome {
  if (
    match.status !== "finished" ||
    match.homeScore === null ||
    match.awayScore === null
  ) {
    return "unknown";
  }

  if (match.homeScore > match.awayScore) {
    return "home_win";
  }

  if (match.awayScore > match.homeScore) {
    return "away_win";
  }

  return "draw";
}
