import { describe, expect, it } from "vitest";

import { buildScoreTimeline } from "@/lib/format/match-timeline";

describe("buildScoreTimeline", () => {
  it("builds cumulative home and away scores from scoring event types", () => {
    expect(
      buildScoreTimeline(
        [
          {
            minute: 10,
            playerName: "Home Wing",
            teamId: "home-team",
            type: "try",
          },
          {
            minute: 12,
            playerName: "Home Fly-half",
            teamId: "home-team",
            type: "conversion",
          },
          {
            minute: 30,
            playerName: "Away Kicker",
            teamId: "away-team",
            type: "penalty_goal",
          },
        ],
        "home-team",
      ),
    ).toEqual([
      {
        awayScore: 0,
        homeScore: 0,
        minute: 0,
        playerName: null,
        team: "home",
        type: "kickoff",
      },
      {
        awayScore: 0,
        homeScore: 5,
        minute: 10,
        playerName: "Home Wing",
        team: "home",
        type: "try",
      },
      {
        awayScore: 0,
        homeScore: 7,
        minute: 12,
        playerName: "Home Fly-half",
        team: "home",
        type: "conversion",
      },
      {
        awayScore: 3,
        homeScore: 7,
        minute: 30,
        playerName: "Away Kicker",
        team: "away",
        type: "penalty_goal",
      },
    ]);
  });

  it("ignores cards and events without a minute", () => {
    expect(
      buildScoreTimeline(
        [
          {
            minute: null,
            playerName: "Unknown",
            teamId: "home-team",
            type: "try",
          },
          {
            minute: 20,
            playerName: "Carded Player",
            teamId: "home-team",
            type: "yellow_card",
          },
        ],
        "home-team",
      ),
    ).toHaveLength(1);
  });
});
