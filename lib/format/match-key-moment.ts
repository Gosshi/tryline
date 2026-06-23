export type MatchKeyMomentEvent = {
  id: string;
  isPenaltyTry?: boolean;
  minute: number | null;
  playerName: string;
  points?: number | null;
  teamId: string;
  type: string;
};

export type MatchKeyMoment = {
  event: MatchKeyMomentEvent;
  label: "リードを奪った得点" | "リードを広げた得点";
  score: {
    away: number;
    home: number;
  };
  team: "away" | "home";
};

export type MatchEventHighlights = {
  firstHalfMaxLead: {
    margin: number;
    team: "away" | "home";
  } | null;
  firstYellowCard: {
    event: MatchKeyMomentEvent;
    team: "away" | "home";
  } | null;
  primary: MatchKeyMoment | null;
  scoreIntegrity: boolean;
};

type ScoringState = {
  afterAway: number;
  afterHome: number;
  beforeAway: number;
  beforeHome: number;
  event: MatchKeyMomentEvent;
  team: "away" | "home";
};

function pointsForEvent(event: MatchKeyMomentEvent): number {
  if (event.points !== null && event.points !== undefined) {
    return event.points;
  }

  if (event.type === "try") {
    return event.isPenaltyTry ? 7 : 5;
  }

  if (event.type === "conversion") {
    return 2;
  }

  if (
    event.type === "penalty" ||
    event.type === "penalty_goal" ||
    event.type === "drop_goal"
  ) {
    return 3;
  }

  return 0;
}

function sortEvents(events: MatchKeyMomentEvent[]): MatchKeyMomentEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      if (left.event.minute === null && right.event.minute === null) {
        return left.index - right.index;
      }

      if (left.event.minute === null) {
        return 1;
      }

      if (right.event.minute === null) {
        return -1;
      }

      return left.event.minute - right.event.minute || left.index - right.index;
    })
    .map(({ event }) => event);
}

export function deriveMatchEventHighlights({
  events,
  finalAwayScore,
  finalHomeScore,
  homeTeamId,
}: {
  events: MatchKeyMomentEvent[];
  finalAwayScore: number;
  finalHomeScore: number;
  homeTeamId: string;
}): MatchEventHighlights {
  const sorted = sortEvents(events);
  const scoringStates: ScoringState[] = [];
  let homeScore = 0;
  let awayScore = 0;

  for (const event of sorted) {
    const points = pointsForEvent(event);

    if (points <= 0) {
      continue;
    }

    const team = event.teamId === homeTeamId ? "home" : "away";
    const beforeHome = homeScore;
    const beforeAway = awayScore;

    if (team === "home") {
      homeScore += points;
    } else {
      awayScore += points;
    }

    scoringStates.push({
      afterAway: awayScore,
      afterHome: homeScore,
      beforeAway,
      beforeHome,
      event,
      team,
    });
  }

  const scoreIntegrity =
    homeScore === finalHomeScore && awayScore === finalAwayScore;
  const firstYellow = sorted.find((event) => event.type === "yellow_card");
  let firstHalfMaxLead: MatchEventHighlights["firstHalfMaxLead"] = null;

  for (const state of scoringStates) {
    if (state.event.minute === null || state.event.minute > 40) {
      continue;
    }

    const margin = Math.abs(state.afterHome - state.afterAway);

    if (margin > (firstHalfMaxLead?.margin ?? 0)) {
      firstHalfMaxLead = {
        margin,
        team: state.afterHome > state.afterAway ? "home" : "away",
      };
    }
  }

  const base: Omit<MatchEventHighlights, "primary"> = {
    firstHalfMaxLead,
    firstYellowCard: firstYellow
      ? {
          event: firstYellow,
          team: firstYellow.teamId === homeTeamId ? "home" : "away",
        }
      : null,
    scoreIntegrity,
  };

  if (
    !scoreIntegrity ||
    finalHomeScore === finalAwayScore ||
    scoringStates.length === 0
  ) {
    return { ...base, primary: null };
  }

  const winner = finalHomeScore > finalAwayScore ? "home" : "away";
  const winnerLead = (state: ScoringState) =>
    winner === "home"
      ? state.afterHome - state.afterAway
      : state.afterAway - state.afterHome;
  const beforeWinnerLead = (state: ScoringState) =>
    winner === "home"
      ? state.beforeHome - state.beforeAway
      : state.beforeAway - state.beforeHome;
  const neverRelinquishesLeadFrom = (index: number) =>
    scoringStates.slice(index).every((state) => winnerLead(state) > 0);
  const wireToWire =
    scoringStates[0]?.team === winner &&
    scoringStates.every((state) => winnerLead(state) > 0);

  let selected: ScoringState | undefined;

  if (wireToWire) {
    selected =
      scoringStates.find(
        (state) => state.team === winner && winnerLead(state) > 8,
      ) ?? scoringStates[0];
  } else {
    for (let index = scoringStates.length - 1; index >= 0; index -= 1) {
      const state = scoringStates[index];

      if (
        state &&
        state.team === winner &&
        beforeWinnerLead(state) <= 0 &&
        winnerLead(state) > 0 &&
        neverRelinquishesLeadFrom(index)
      ) {
        selected = state;
        break;
      }
    }
  }

  if (!selected) {
    return { ...base, primary: null };
  }

  return {
    ...base,
    primary: {
      event: selected.event,
      label:
        beforeWinnerLead(selected) <= 0
          ? "リードを奪った得点"
          : "リードを広げた得点",
      score: {
        away: selected.afterAway,
        home: selected.afterHome,
      },
      team: selected.team,
    },
  };
}
