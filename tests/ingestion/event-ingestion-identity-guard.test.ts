import { describe, expect, it } from "vitest";

import { validateEventInsertion } from "@/lib/ingestion/event-integrity";

const match = {
  awayScore: 17,
  awayTeamId: "away",
  externalIds: { match_url: "https://source.test/match/1" },
  homeScore: 56,
  homeTeamId: "home",
  id: "f01f68e2-bdd6-47c8-8910-0ea37a382b0a",
  status: "finished",
} as const;

function scoringEvents(home: number, away: number) {
  return [
    ...Array.from({ length: home / 5 }, (_, minute) => ({
      isPenaltyTry: false,
      minute: minute + 1,
      playerName: `Home ${minute + 1}`,
      teamSide: "home" as const,
      type: "try" as const,
    })),
    ...Array.from({ length: away / 5 }, (_, minute) => ({
      isPenaltyTry: false,
      minute: minute + 40,
      playerName: `Away ${minute + 1}`,
      teamSide: "away" as const,
      type: "try" as const,
    })),
  ];
}

function validate(overrides: Partial<Parameters<typeof validateEventInsertion>[0]> = {}) {
  return validateEventInsertion({
    candidateEvents: scoringEvents(55, 15),
    canonicalMatch: { ...match, awayScore: 15, homeScore: 55 },
    existingSignatureGroups: [],
    matchesWithFixtureIdentifiers: [{ externalIds: match.externalIds, id: match.id }],
    suppliedAwayTeamId: "away",
    suppliedHomeTeamId: "home",
    ...overrides,
  });
}

describe("event ingestion identity guard", () => {
  it("rejects the second-test regression fixture before a write when 32-35 events target 56-17", () => {
    const events = [
      ...scoringEvents(20, 25),
      ...Array.from({ length: 3 }, (_, index) => ({
        isPenaltyTry: false,
        minute: 60 + index,
        playerName: `Home conversion ${index}`,
        teamSide: "home" as const,
        type: "conversion" as const,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        isPenaltyTry: false,
        minute: 70 + index,
        playerName: `Home penalty ${index}`,
        teamSide: "home" as const,
        type: "penalty_goal" as const,
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        isPenaltyTry: false,
        minute: 75 + index,
        playerName: `Away conversion ${index}`,
        teamSide: "away" as const,
        type: "conversion" as const,
      })),
    ];
    const result = validate({ candidateEvents: events, canonicalMatch: match });

    expect(result.rejected).toContainEqual(expect.objectContaining({ reason: "score_mismatch" }));
  });

  it("rejects supplied teams that do not belong to the match", () => {
    expect(validate({ suppliedHomeTeamId: "third-team" }).rejected).toContainEqual(
      expect.objectContaining({ reason: "third_team" }),
    );
  });

  it("warns, but does not reject, a four-event duplicate signature", () => {
    const candidateEvents = scoringEvents(10, 10);
    const result = validate({
      candidateEvents,
      canonicalMatch: { ...match, awayScore: 10, homeScore: 10 },
      existingSignatureGroups: [{
        matchId: "other-match",
        events: candidateEvents.map((event) => ({
          metadata: { player_name: event.playerName },
          minute: event.minute,
          type: event.type,
        })),
      }],
    });

    expect(result.rejected).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ reason: "duplicate_signature" }));
  });

  it("does not warn for three matching signatures", () => {
    const candidateEvents = scoringEvents(10, 5);
    expect(validate({
      candidateEvents,
      existingSignatureGroups: [{
        matchId: "other-match",
        events: candidateEvents.map((event) => ({ metadata: { player_name: event.playerName }, minute: event.minute, type: event.type })),
      }],
    }).warnings).toEqual([]);
  });

  it("rejects a fixture identifier already assigned to another match", () => {
    expect(validate({
      matchesWithFixtureIdentifiers: [
        { externalIds: match.externalIds, id: match.id },
        { externalIds: match.externalIds, id: "other-match" },
      ],
    }).rejected).toContainEqual(expect.objectContaining({ reason: "fixture_conflict" }));
  });

  it("accepts matching totals and skips only V1 for unfinished matches", () => {
    expect(validate().rejected).toEqual([]);
    expect(validate({
      candidateEvents: [],
      canonicalMatch: { ...match, status: "scheduled" },
    }).rejected).toEqual([]);
  });
});
