import { describe, expect, it } from "vitest";

import {
  summarizeDraftBacklog,
  summarizeActionableDataIntegrityMatches,
  summarizeDuplicateEvents,
  summarizeEmptyFinishedEvents,
  summarizeScoreMismatches,
  summarizeStaleStandings,
  type AuditFinishedMatchRow,
} from "@/lib/data-integrity/audit";

import type { CleanupMatchRow } from "@/lib/data-integrity/contaminated-events";

const duplicatedEvents = [
  { id: "e1", minute: 10, player_id: "p1", type: "try" },
  { id: "e2", minute: 11, player_id: "p2", type: "conversion" },
  { id: "e3", minute: 20, player_id: "p3", type: "try" },
  { id: "e4", minute: null, player_id: null, type: "penalty_goal" },
];

function cleanupMatch(
  id: string,
  events: CleanupMatchRow["match_events"],
): CleanupMatchRow {
  return {
    away_team: { name: `Away ${id}` },
    home_team: { name: `Home ${id}` },
    id,
    kickoff_at: "2026-01-01T00:00:00.000Z",
    match_content: [],
    match_events: events,
  };
}

function auditMatch(
  overrides: Partial<AuditFinishedMatchRow>,
): AuditFinishedMatchRow {
  return {
    away_score: 7,
    away_team: { name: "Away" },
    away_team_id: "away-id",
    competition: { name: "Rugby Championship", season: "2026" },
    home_score: 10,
    home_team: { name: "Home" },
    home_team_id: "home-id",
    id: "match-1",
    kickoff_at: "2026-01-01T00:00:00.000Z",
    match_content: [],
    match_events: [
      {
        id: "event-1",
        metadata: {},
        minute: 10,
        player_id: null,
        team_id: "home-id",
        type: "try",
      },
      {
        id: "event-2",
        metadata: {},
        minute: 11,
        player_id: null,
        team_id: "home-id",
        type: "conversion",
      },
      {
        id: "event-3",
        metadata: {},
        minute: 20,
        player_id: null,
        team_id: "away-id",
        type: "try",
      },
      {
        id: "event-4",
        metadata: {},
        minute: 21,
        player_id: null,
        team_id: "away-id",
        type: "conversion",
      },
      {
        id: "event-5",
        metadata: {},
        minute: 60,
        player_id: null,
        team_id: "home-id",
        type: "penalty_goal",
      },
    ],
    ...overrides,
  };
}

describe("data integrity audit summaries", () => {
  it("summarizes duplicate event groups and ignores short signatures", () => {
    const summary = summarizeDuplicateEvents([
      cleanupMatch("match-1", duplicatedEvents),
      cleanupMatch("match-2", [...duplicatedEvents].reverse()),
      cleanupMatch("match-3", duplicatedEvents.slice(0, 3)),
      cleanupMatch("match-4", [...duplicatedEvents.slice(0, 3)].reverse()),
    ]);

    expect(summary.groupCount).toBe(1);
    expect(summary.matchCount).toBe(2);
    expect(summary.groups[0]).toMatchObject({
      eventCount: 4,
      matchCount: 2,
      matchIds: ["match-1", "match-2"],
    });
  });

  it("summarizes score mismatches using event-derived totals", () => {
    const summary = summarizeScoreMismatches([
      auditMatch({ id: "matching" }),
      auditMatch({ away_score: 8, id: "mismatch" }),
    ]);

    expect(summary.count).toBe(1);
    expect(summary.matches[0]).toMatchObject({
      actualAway: 7,
      actualHome: 10,
      expectedAway: 8,
      expectedHome: 10,
      matchId: "mismatch",
    });
  });

  it("does not count zero-event matches as score mismatches", () => {
    const summary = summarizeScoreMismatches([
      auditMatch({
        away_score: 99,
        home_score: 99,
        id: "without-events",
        match_events: [],
      }),
    ]);

    expect(summary).toEqual({
      count: 0,
      matches: [],
    });
  });

  it("includes only published recaps in actionable score mismatch metadata", () => {
    const matches = [
      auditMatch({
        away_score: 8,
        id: "published-mismatch",
        match_content: [{ content_type: "recap", status: "published" }],
      }),
      auditMatch({
        away_score: 8,
        id: "draft-mismatch",
        match_content: [{ content_type: "recap", status: "draft" }],
      }),
    ];
    const duplicateEvents = summarizeDuplicateEvents(matches);
    const scoreMismatches = summarizeScoreMismatches(matches);

    expect(
      summarizeActionableDataIntegrityMatches(
        matches,
        duplicateEvents,
        scoreMismatches,
      ),
    ).toEqual([
      {
        competitionLabel: "Rugby Championship 2026",
        duplicateEvents: [
          {
            eventCount: 5,
            matchingMatchCount: 2,
          },
        ],
        matchId: "published-mismatch",
        matchLabel: "Home 対 Away",
        scoreMismatch: {
          actualAway: 7,
          actualHome: 10,
          expectedAway: 8,
          expectedHome: 10,
        },
      },
    ]);
  });

  it("summarizes finished matches with zero events", () => {
    const summary = summarizeEmptyFinishedEvents([
      auditMatch({ id: "with-events" }),
      auditMatch({ id: "without-events", match_events: [] }),
    ]);

    expect(summary).toEqual({
      count: 1,
      matchIds: ["without-events"],
    });
  });

  it("summarizes draft backlog and recent drafts", () => {
    const summary = summarizeDraftBacklog(
      [
        { generated_at: "2026-07-07T00:00:00.000Z", id: "recent" },
        { generated_at: "2026-06-01T00:00:00.000Z", id: "old" },
      ],
      new Date("2026-07-08T00:00:00.000Z"),
    );

    expect(summary).toEqual({
      recent7Days: 1,
      total: 2,
    });
  });

  it("summarizes stale standings for active competitions only", () => {
    const summary = summarizeStaleStandings(
      [
        {
          competition: {
            end_date: "2026-08-01",
            name: "Active stale",
            season: "2026",
            slug: "active-stale-2026",
            start_date: "2026-06-01",
          },
          competition_id: "active-stale",
          updated_at: "2026-06-20T00:00:00.000Z",
        },
        {
          competition: {
            end_date: "2026-08-01",
            name: "Active fresh",
            season: "2026",
            slug: "active-fresh-2026",
            start_date: "2026-06-01",
          },
          competition_id: "active-fresh",
          updated_at: "2026-07-06T00:00:00.000Z",
        },
        {
          competition: {
            end_date: "2026-06-01",
            name: "Finished stale",
            season: "2026",
            slug: "finished-stale-2026",
            start_date: "2026-05-01",
          },
          competition_id: "finished-stale",
          updated_at: "2026-05-20T00:00:00.000Z",
        },
      ],
      new Date("2026-07-08T00:00:00.000Z"),
    );

    expect(summary.count).toBe(1);
    expect(summary.competitions[0]).toMatchObject({
      competitionId: "active-stale",
      daysStale: 18,
      slug: "active-stale-2026",
    });
  });
});
