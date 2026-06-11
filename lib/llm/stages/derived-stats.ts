import { pointsForEvent } from "@/lib/llm/stages/assemble";

import type { AssembledContentInput, DerivedMatchStats } from "@/lib/llm/types";

const SCORING_RUN_MIN_POINTS = 10;
const SCORELESS_PERIOD_MIN_MINUTES = 15;
const SIN_BIN_MINUTES = 10;
const MATCH_END_MINUTE = 80;

type TeamSide = "home" | "away";

type KnownTeamEvent = AssembledContentInput["match_events"][number] & {
  team: TeamSide;
};

type ScoringEvent = KnownTeamEvent & {
  minute: number;
  points: number;
};

function resolveTeamSide(
  event: AssembledContentInput["match_events"][number],
  homeTeamName: string,
  awayTeamName: string,
): TeamSide | null {
  if (event.team_name === homeTeamName) {
    return "home";
  }

  if (event.team_name === awayTeamName) {
    return "away";
  }

  return null;
}

function getLineupPlayer(
  lineups: AssembledContentInput["projected_lineups"],
  team: TeamSide,
  playerName: string,
) {
  return lineups[team].find((player) => player.name === playerName) ?? null;
}

function addScorelessPeriod(
  periods: DerivedMatchStats["scoreless_periods"],
  fromMinute: number,
  toMinute: number,
) {
  if (toMinute - fromMinute >= SCORELESS_PERIOD_MIN_MINUTES) {
    periods.push({
      from_minute: fromMinute,
      to_minute: toMinute,
    });
  }
}

export function computeDerivedMatchStats(
  events: AssembledContentInput["match_events"],
  lineups: AssembledContentInput["projected_lineups"],
  homeTeamName: string,
  awayTeamName: string,
): DerivedMatchStats | null {
  if (events.length === 0) {
    return null;
  }

  const knownEvents: KnownTeamEvent[] = [];
  for (const event of events) {
    const team = resolveTeamSide(event, homeTeamName, awayTeamName);
    if (!team) {
      continue;
    }
    knownEvents.push({ ...event, team });
  }

  const conversions: DerivedMatchStats["conversions"] = {
    away: { attempts: 0, made: 0 },
    home: { attempts: 0, made: 0 },
  };
  const pointsBreakdown: DerivedMatchStats["points_breakdown"] = {
    away: { conversions: 0, drop_goals: 0, penalties: 0, tries: 0 },
    home: { conversions: 0, drop_goals: 0, penalties: 0, tries: 0 },
  };
  const tryScorers: DerivedMatchStats["try_scorers"] = [];

  for (const event of knownEvents) {
    if (event.type === "try") {
      pointsBreakdown[event.team].tries += pointsForEvent(event);
      if (!event.is_penalty_try) {
        conversions[event.team].attempts += 1;
      }
      const lineupPlayer = getLineupPlayer(lineups, event.team, event.player_name);
      tryScorers.push({
        is_starter: lineupPlayer?.is_starter ?? null,
        jersey_number: lineupPlayer?.jersey_number ?? null,
        minute: event.minute,
        player: event.player_name,
        position: lineupPlayer?.position ?? null,
        team: event.team,
      });
    } else if (event.type === "conversion") {
      conversions[event.team].made += 1;
      pointsBreakdown[event.team].conversions += pointsForEvent(event);
    } else if (event.type === "penalty" || event.type === "penalty_goal") {
      pointsBreakdown[event.team].penalties += pointsForEvent(event);
    } else if (event.type === "drop_goal") {
      pointsBreakdown[event.team].drop_goals += pointsForEvent(event);
    }
  }

  const scoringEvents: ScoringEvent[] = knownEvents
    .map((event) => ({
      ...event,
      points: pointsForEvent(event),
    }))
    .filter(
      (event): event is ScoringEvent =>
        event.minute !== null && event.points > 0,
    )
    .sort((a, b) => a.minute - b.minute);

  const scoringRuns: DerivedMatchStats["scoring_runs"] = [];
  const scorelessPeriods: DerivedMatchStats["scoreless_periods"] = [];
  const cards: DerivedMatchStats["cards"] = [];
  let maxLead: DerivedMatchStats["max_lead"] = null;
  let homeScore = 0;
  let awayScore = 0;
  let htHome = 0;
  let htAway = 0;
  let htSet = false;
  let currentRun: {
    team: TeamSide;
    points: number;
    start_minute: number;
    end_minute: number;
  } | null = null;
  let maxHomeDeficit = 0;
  let maxAwayDeficit = 0;
  let previousScoreMinute = 0;

  function flushRun() {
    if (currentRun && currentRun.points >= SCORING_RUN_MIN_POINTS) {
      scoringRuns.push(currentRun);
    }
  }

  for (const event of scoringEvents) {
    if (!htSet && event.minute > 40) {
      htHome = homeScore;
      htAway = awayScore;
      htSet = true;
    }

    addScorelessPeriod(scorelessPeriods, previousScoreMinute, event.minute);
    previousScoreMinute = event.minute;

    if (currentRun && currentRun.team === event.team) {
      currentRun.points += event.points;
      currentRun.end_minute = event.minute;
    } else {
      flushRun();
      currentRun = {
        end_minute: event.minute,
        points: event.points,
        start_minute: event.minute,
        team: event.team,
      };
    }

    if (event.team === "home") {
      homeScore += event.points;
    } else {
      awayScore += event.points;
    }

    const lead = Math.abs(homeScore - awayScore);
    if (lead > 0) {
      const leader = homeScore > awayScore ? "home" : "away";
      if (!maxLead || lead > maxLead.points) {
        maxLead = {
          minute: event.minute,
          points: lead,
          team: leader,
        };
      }
    }

    maxHomeDeficit = Math.max(maxHomeDeficit, awayScore - homeScore);
    maxAwayDeficit = Math.max(maxAwayDeficit, homeScore - awayScore);
  }

  flushRun();
  addScorelessPeriod(scorelessPeriods, previousScoreMinute, MATCH_END_MINUTE);

  if (!htSet) {
    htHome = homeScore;
    htAway = awayScore;
  }

  for (const event of knownEvents) {
    if (
      event.minute === null ||
      (event.type !== "yellow_card" && event.type !== "red_card")
    ) {
      continue;
    }

    const opponent = event.team === "home" ? "away" : "home";
    const windowEnd =
      event.type === "yellow_card"
        ? event.minute + SIN_BIN_MINUTES
        : MATCH_END_MINUTE;
    const opponentPointsDuring = scoringEvents
      .filter(
        (scoringEvent) =>
          scoringEvent.team === opponent &&
          scoringEvent.minute >= event.minute! &&
          scoringEvent.minute <= windowEnd,
      )
      .reduce((sum, scoringEvent) => sum + scoringEvent.points, 0);

    cards.push({
      minute: event.minute,
      opponent_points_during: opponentPointsDuring,
      player: event.player_name,
      team: event.team,
      type: event.type,
    });
  }

  const comeback =
    homeScore === awayScore
      ? null
      : homeScore > awayScore && maxHomeDeficit > 0
        ? { deficit_overcome: maxHomeDeficit, team: "home" as const }
        : awayScore > homeScore && maxAwayDeficit > 0
          ? { deficit_overcome: maxAwayDeficit, team: "away" as const }
          : null;

  return {
    cards,
    comeback,
    conversions,
    max_lead: maxLead,
    points_breakdown: pointsBreakdown,
    scoreless_periods: scorelessPeriods,
    scoring_runs: scoringRuns,
    second_half: {
      away_points: awayScore - htAway,
      home_points: homeScore - htHome,
    },
    try_scorers: tryScorers,
  };
}

export type { DerivedMatchStats };
