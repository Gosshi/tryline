import { describe, expect, it } from "vitest";

import {
  buildTeamRecord,
  buildTeamScoringStats,
  buildTopScorers,
  type TeamStatsMatchRow,
} from "@/lib/db/queries/team-stats";

const TEAM_ID = "team-1";
const OTHER_ID = "team-2";

function match(
  overrides: Partial<TeamStatsMatchRow> & { id: string; kickoff_at: string },
): TeamStatsMatchRow {
  return {
    away_score: 10,
    away_team_id: OTHER_ID,
    home_score: 20,
    home_team_id: TEAM_ID,
    ...overrides,
  };
}

describe("team stats aggregators", () => {
  it("calculates wins, draws, and losses with home and away matches", () => {
    const record = buildTeamRecord(
      [
        match({
          away_score: 10,
          home_score: 30,
          id: "match-1",
          kickoff_at: "2026-05-03T12:00:00.000Z",
        }),
        match({
          away_score: 20,
          away_team_id: TEAM_ID,
          home_score: 20,
          home_team_id: OTHER_ID,
          id: "match-2",
          kickoff_at: "2026-05-02T12:00:00.000Z",
        }),
        match({
          away_score: 25,
          home_score: 10,
          id: "match-3",
          kickoff_at: "2026-05-01T12:00:00.000Z",
        }),
      ],
      TEAM_ID,
    );

    expect(record).toMatchObject({
      draws: 1,
      losses: 1,
      matchCount: 3,
      pointsAgainst: 55,
      pointsFor: 60,
      wins: 1,
    });
  });

  it("keeps the latest five form results in newest-first order", () => {
    const record = buildTeamRecord(
      [
        match({
          away_score: 10,
          home_score: 30,
          id: "match-1",
          kickoff_at: "2026-05-07T12:00:00.000Z",
        }),
        match({
          away_score: 12,
          home_score: 22,
          id: "match-2",
          kickoff_at: "2026-05-06T12:00:00.000Z",
        }),
        match({
          away_score: 28,
          home_score: 13,
          id: "match-3",
          kickoff_at: "2026-05-05T12:00:00.000Z",
        }),
        match({
          away_score: 15,
          home_score: 15,
          id: "match-4",
          kickoff_at: "2026-05-04T12:00:00.000Z",
        }),
        match({
          away_score: 16,
          home_score: 21,
          id: "match-5",
          kickoff_at: "2026-05-03T12:00:00.000Z",
        }),
        match({
          away_score: 40,
          home_score: 12,
          id: "match-6",
          kickoff_at: "2026-05-02T12:00:00.000Z",
        }),
        match({
          away_score: 12,
          home_score: 13,
          id: "match-7",
          kickoff_at: "2026-05-01T12:00:00.000Z",
        }),
      ],
      TEAM_ID,
    );

    expect(record.form).toEqual(["W", "W", "L", "D", "W"]);
  });

  it("aggregates top scorers by player name", () => {
    const topScorers = buildTopScorers([
      {
        match_id: "match-1",
        metadata: { player_name: "Finn Russell" },
        type: "try",
      },
      {
        match_id: "match-1",
        metadata: { player_name: "Finn Russell" },
        type: "conversion",
      },
      {
        match_id: "match-2",
        metadata: { player_name: "Finn Russell" },
        type: "penalty_goal",
      },
      {
        match_id: "match-2",
        metadata: { player_name: "Ben Spencer" },
        type: "drop_goal",
      },
    ]);

    expect(topScorers[0]).toEqual({
      conversions: 1,
      penalties: 1,
      playerName: "Finn Russell",
      tries: 1,
    });
    expect(topScorers[1]).toEqual({
      conversions: 0,
      penalties: 1,
      playerName: "Ben Spencer",
      tries: 0,
    });
  });

  it("excludes events with null or empty player names from top scorers", () => {
    const topScorers = buildTopScorers([
      { match_id: "match-1", metadata: {}, type: "try" },
      {
        match_id: "match-1",
        metadata: { player_name: "" },
        type: "conversion",
      },
      { match_id: "match-1", metadata: null, type: "penalty_goal" },
      {
        match_id: "match-1",
        metadata: { player_name: "Ben Spencer" },
        type: "try",
      },
    ]);

    expect(topScorers).toEqual([
      {
        conversions: 0,
        penalties: 0,
        playerName: "Ben Spencer",
        tries: 1,
      },
    ]);
  });

  it("returns zero scoring stats when there are no match events", () => {
    expect(
      buildTeamScoringStats({
        events: [],
        matches: [],
        teamId: TEAM_ID,
      }),
    ).toEqual({
      matchCount: 0,
      penaltyGoalsPerMatch: 0,
      pointsForPerMatch: 0,
      triesPerMatch: 0,
    });
  });
});
