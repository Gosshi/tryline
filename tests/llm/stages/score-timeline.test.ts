import { describe, expect, it } from "vitest";

import {
  computeMatchStats,
  computeScoreTimeline,
  eventTotalsMatchFinalScore,
} from "@/lib/llm/stages/assemble";

describe("computeScoreTimeline", () => {
  it("computes halftime score, lead changes, and the winning score", () => {
    const result = computeScoreTimeline(
      [
        {
          minute: 5,
          player_name: "Home Try 1",
          team_name: "サントリー",
          type: "try",
        },
        {
          minute: 6,
          player_name: "Home Conversion 1",
          team_name: "サントリー",
          type: "conversion",
        },
        {
          minute: 10,
          player_name: "Away Try 1",
          team_name: "リコー",
          type: "try",
        },
        {
          minute: 11,
          player_name: "Away Conversion 1",
          team_name: "リコー",
          type: "conversion",
        },
        {
          minute: 20,
          player_name: "Home Try 2",
          team_name: "サントリー",
          type: "try",
        },
        {
          minute: 21,
          player_name: "Home Conversion 2",
          team_name: "サントリー",
          type: "conversion",
        },
        {
          minute: 30,
          player_name: "Home Try 3",
          team_name: "サントリー",
          type: "try",
        },
        {
          minute: 31,
          player_name: "Home Conversion 3",
          team_name: "サントリー",
          type: "conversion",
        },
        {
          minute: 38,
          player_name: "Home Penalty 0",
          team_name: "サントリー",
          type: "penalty_goal",
        },
        {
          minute: 39,
          player_name: "Home Penalty",
          team_name: "サントリー",
          type: "penalty_goal",
        },
        {
          minute: 40,
          player_name: "Away Penalty",
          team_name: "リコー",
          type: "penalty_goal",
        },
        {
          minute: 50,
          player_name: "Away Try 2",
          team_name: "リコー",
          type: "try",
        },
        {
          minute: 51,
          player_name: "Away Conversion 2",
          team_name: "リコー",
          type: "conversion",
        },
        {
          minute: 60,
          player_name: "Away Try 3",
          team_name: "リコー",
          type: "try",
        },
        {
          minute: 61,
          player_name: "Away Conversion 3",
          team_name: "リコー",
          type: "conversion",
        },
        {
          minute: 65,
          player_name: "Away Drop Goal",
          team_name: "リコー",
          type: "drop_goal",
        },
        {
          minute: 70,
          player_name: "Home Penalty 2",
          team_name: "サントリー",
          type: "penalty_goal",
        },
        {
          minute: 73,
          player_name: "Away Try 4",
          team_name: "リコー",
          type: "try",
        },
        {
          minute: 76,
          player_name: "Home Penalty 3",
          team_name: "サントリー",
          type: "penalty_goal",
        },
        {
          minute: 78,
          player_name: "中楠一期",
          team_name: "リコー",
          type: "penalty_goal",
        },
        {
          minute: 84,
          player_name: "森川由起乙",
          team_name: "サントリー",
          type: "try",
        },
        {
          minute: 85,
          player_name: "チェスリン・コルビ",
          team_name: "サントリー",
          type: "conversion",
        },
      ],
      "サントリー",
      "リコー",
    );

    expect(result).toMatchObject({
      final_away: 35,
      final_home: 40,
      ht_away: 10,
      ht_home: 27,
      winning_score: {
        minute: 84,
        player: "森川由起乙",
        team: "home",
        type: "try",
      },
    });
    expect(result?.lead_changes).toEqual(
      expect.arrayContaining([
        { away: 35, home: 33, minute: 78, new_leader: "away" },
        { away: 35, home: 38, minute: 84, new_leader: "home" },
      ]),
    );
  });

  it("scores penalty tries as seven points without changing normal tries", () => {
    const result = computeScoreTimeline(
      [
        {
          is_penalty_try: true,
          minute: 12,
          player_name: "Penalty try",
          team_name: "Home",
          type: "try",
        },
        {
          minute: 20,
          player_name: "Normal try",
          team_name: "Away",
          type: "try",
        },
      ],
      "Home",
      "Away",
    );

    expect(result).toMatchObject({
      final_away: 5,
      final_home: 7,
      ht_away: 5,
      ht_home: 7,
    });
  });

  it("counts penalty_goal events in match penalty stats", () => {
    const result = computeMatchStats(
      [
        {
          minute: 10,
          player_name: "Home penalty",
          team_name: "Home",
          type: "penalty_goal",
        },
        {
          minute: 20,
          player_name: "Away penalty",
          team_name: "Away",
          type: "penalty_goal",
        },
        {
          minute: 30,
          player_name: "Legacy penalty",
          team_name: "Home",
          type: "penalty",
        },
      ],
      "Home",
      "Away",
    );

    expect(result.penalty_count).toEqual({ away: 1, home: 1 });
  });
});

describe("eventTotalsMatchFinalScore", () => {
  const timeline = computeScoreTimeline(
    [
      {
        minute: 10,
        player_name: "Scorer",
        team_name: "Home",
        type: "try",
      },
      {
        minute: 11,
        player_name: "Kicker",
        team_name: "Home",
        type: "conversion",
      },
      {
        minute: 50,
        player_name: "Away Kicker",
        team_name: "Away",
        type: "penalty_goal",
      },
    ],
    "Home",
    "Away",
  );

  it("returns true when event totals equal the final score", () => {
    expect(eventTotalsMatchFinalScore(timeline, 7, 3)).toBe(true);
  });

  it("returns false when either side mismatches", () => {
    expect(eventTotalsMatchFinalScore(timeline, 10, 3)).toBe(false);
    expect(eventTotalsMatchFinalScore(timeline, 7, 6)).toBe(false);
  });

  it("returns false for null timeline or null scores", () => {
    expect(eventTotalsMatchFinalScore(null, 7, 3)).toBe(false);
    expect(eventTotalsMatchFinalScore(timeline, null, 3)).toBe(false);
    expect(eventTotalsMatchFinalScore(timeline, 7, null)).toBe(false);
  });
});
