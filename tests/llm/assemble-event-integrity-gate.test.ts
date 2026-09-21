import { describe, expect, it } from "vitest";

import {
  calculateStandingsFreshness,
  determineEventIntegrity,
} from "@/lib/llm/stages/assemble";

import type { ScoreTimeline } from "@/lib/llm/types";

const scoreTimeline: ScoreTimeline = {
  final_away: 17,
  final_home: 56,
  ht_away: 10,
  ht_home: 21,
  lead_changes: [],
  score_progression: [],
  winning_score: null,
};

describe("recap event integrity gate", () => {
  it("uses team ids to compare expected games with standings coverage", () => {
    expect(
      calculateStandingsFreshness({
        awayTeamId: "away-id",
        finishedMatches: [
          { away_team_id: "away-id", home_team_id: "other" },
          { away_team_id: "other", home_team_id: "home-id" },
        ],
        homeTeamId: "home-id",
        standings: [
          { played: 1, team_id: "home-id" },
          { played: 0, team_id: "away-id" },
        ],
      }),
    ).toEqual({
      away: { expected_played: 1, played: 0 },
      home: { expected_played: 1, played: 1 },
    });
  });

  it("retains mismatch evidence while identifying a finished score mismatch", () => {
    expect(
      determineEventIntegrity(
        "recap",
        { away_score: 17, home_score: 56, status: "finished" },
        19,
        { ...scoreTimeline, final_away: 35, final_home: 32 },
      ),
    ).toEqual({
      actual: { away: 35, home: 32 },
      delta: { away: 18, home: -24 },
      eventCount: 19,
      expected: { away: 17, home: 56 },
      reason: "score_mismatch",
      status: "mismatch",
    });
  });

  it("marks a matching finished recap as verified", () => {
    expect(
      determineEventIntegrity(
        "recap",
        { away_score: 17, home_score: 56, status: "finished" },
        19,
        scoreTimeline,
      ),
    ).toMatchObject({
      reason: "verified",
      status: "verified",
    });
  });

  it("prioritizes an unavailable final score over missing events", () => {
    expect(
      determineEventIntegrity(
        "recap",
        { away_score: null, home_score: null, status: "finished" },
        0,
        null,
      ),
    ).toEqual({
      actual: null,
      delta: null,
      eventCount: 0,
      expected: { away: null, home: null },
      reason: "score_unavailable",
      status: "unavailable",
    });
  });

  it.each([
    ["preview", { away_score: 17, home_score: 56, status: "finished" }, 19, scoreTimeline, "content_type_not_recap"],
    ["recap", { away_score: 17, home_score: 56, status: "scheduled" }, 19, scoreTimeline, "match_not_finished"],
    ["recap", { away_score: 17, home_score: null, status: "finished" }, 19, scoreTimeline, "score_unavailable"],
    ["recap", { away_score: 17, home_score: 56, status: "finished" }, 0, null, "events_unavailable"],
  ] as const)(
    "does not classify %s with %s as a mismatch",
    (contentType, match, eventCount, timeline, reason) => {
      expect(
        determineEventIntegrity(contentType, match, eventCount, timeline),
      ).toMatchObject({ reason, status: "unavailable" });
    },
  );
});
