export type ScorePoint = {
  awayScore: number;
  homeScore: number;
  minute: number;
  playerName: string | null;
  team: "home" | "away";
  type: string;
};

export function buildScoreTimeline(
  events: Array<{
    isPenaltyTry?: boolean;
    minute: number | null;
    playerName: string | null;
    points?: number | null;
    teamId: string;
    type: string;
  }>,
  homeTeamId: string,
): ScorePoint[] {
  const scoring = events
    .filter(
      (event) =>
        event.minute !== null &&
        (event.points ?? pointsFromType(event.type, event.isPenaltyTry)) > 0,
    )
    .sort((left, right) => (left.minute ?? 0) - (right.minute ?? 0));

  let homeScore = 0;
  let awayScore = 0;
  const timeline: ScorePoint[] = [
    {
      awayScore: 0,
      homeScore: 0,
      minute: 0,
      playerName: null,
      team: "home",
      type: "kickoff",
    },
  ];

  for (const event of scoring) {
    const isHome = event.teamId === homeTeamId;
    const points = event.points ?? pointsFromType(event.type, event.isPenaltyTry);

    if (isHome) {
      homeScore += points;
    } else {
      awayScore += points;
    }

    timeline.push({
      awayScore,
      homeScore,
      minute: event.minute!,
      playerName: event.playerName,
      team: isHome ? "home" : "away",
      type: event.type,
    });
  }

  return timeline;
}

function pointsFromType(type: string, isPenaltyTry?: boolean): number {
  if (type === "try") return isPenaltyTry ? 7 : 5;
  if (type === "conversion") return 2;
  if (type === "penalty" || type === "penalty_goal" || type === "drop_goal") {
    return 3;
  }
  return 0;
}
