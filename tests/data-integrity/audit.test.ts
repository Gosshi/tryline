import { describe, expect, it, vi } from "vitest";

import {
  summarizeDraftBacklog,
  summarizeActionableDataIntegrityMatches,
  summarizeDuplicateEvents,
  summarizeEmptyFinishedEvents,
  summarizeScoreMismatches,
  summarizeStructuralContamination,
  summarizeStaleScheduledMatches,
  runDataIntegrityAudit,
  loadFinishedMatches,
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

  it("loads all finished matches through two ordered pages", async () => {
    const rows = Array.from({ length: 1500 }, (_, index) => ({
      id: `match-${String(index).padStart(4, "0")}`,
      match_events: [],
    }));
    const ranges: Array<[number, number]> = [];
    let query: Record<string, (...args: never[]) => unknown>;
    const client = {
      from: () => {
        query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn((from: number, to: number) => {
            ranges.push([from, to]);
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          }),
        } as never;
        return query;
      },
    };

    const loaded = await loadFinishedMatches(client as never);

    expect(loaded).toHaveLength(1500);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

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

  it("reports structural contamination with owner ids and published-recap status", () => {
    const types = ["try", "conversion", "try", "conversion", "try", "conversion", "try", "conversion"];
    const ownerEvents = types.map((type, index) => ({
      id: `owner-${index}`,
      metadata: {},
      minute: index + 1,
      player_id: `player-${index}`,
      team_id: "home-id",
      type,
    }));
    const copyEvents = ownerEvents.map((event) => ({
      ...event,
      id: `copy-${event.minute}`,
      player_id: null,
      team_id: "away-id",
    }));
    const summary = summarizeStructuralContamination([
      auditMatch({
        away_score: 0,
        home_score: 28,
        id: "owner",
        match_events: ownerEvents,
      }),
      auditMatch({
        away_score: 0,
        home_score: 28,
        id: "copy",
        match_content: [{ content_type: "recap", status: "published" }],
        match_events: copyEvents,
      }),
    ]);

    expect(summary).toMatchObject({
      groupCount: 1,
      matchCount: 1,
      groups: [{
        owners: ["owner"],
        contaminated: [{ matchId: "copy", hasPublishedRecap: true }],
      }],
    });
  });

  it("includes structural contamination in the weekly audit database report", async () => {
    const types = ["try", "conversion", "try", "conversion", "try", "conversion", "try", "conversion"];
    const ownerEvents = types.map((type, index) => ({
      id: `owner-${index}`,
      metadata: {},
      minute: index + 1,
      player_id: `player-${index}`,
      team_id: "home-id",
      type,
    }));
    const copyEvents = ownerEvents.map((event) => ({
      ...event,
      id: `copy-${event.minute}`,
      player_id: null,
      team_id: "away-id",
    }));
    const finishedMatches = [
      auditMatch({ away_score: 0, home_score: 28, id: "owner", match_events: ownerEvents }),
      auditMatch({
        away_score: 0,
        home_score: 28,
        id: "copy",
        match_content: [{ content_type: "recap", status: "published" }],
        match_events: copyEvents,
      }),
    ];
    let matchQueryCount = 0;
    const createQuery = (data: unknown[]) => ({
      eq: () => createQuery(data),
      lt: () => createQuery(data),
      order: () => createQuery(data),
      range: (from: number, to: number) => Promise.resolve({ data: data.slice(from, to + 1), error: null }),
      select: () => createQuery(data),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data, error: null })),
    });
    const client = {
      from: (table: string) => {
        if (table === "matches") {
          matchQueryCount += 1;
          return createQuery(matchQueryCount === 1 ? finishedMatches : []);
        }
        return createQuery([]);
      },
    };

    const report = await runDataIntegrityAudit(
      client as never,
      new Date("2026-01-01T00:00:00Z"),
    );

    expect(report.structuralContamination).toMatchObject({
      groupCount: 1,
      matchCount: 1,
      groups: [{
        owners: ["owner"],
        contaminated: [{ matchId: "copy", hasPublishedRecap: true }],
      }],
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

  it("reports scheduled matches that remain past their kickoff", () => {
    const summary = summarizeStaleScheduledMatches(
      [
        {
          away_team: { name: "New Zealand" },
          competition: {
            name: "Greatest Rivalry",
            season: "2026",
            slug: "greatest-rivalry-2026",
          },
          home_team: { name: "South Africa" },
          id: "stale-match",
          kickoff_at: "2026-09-12T21:00:00.000Z",
        },
        {
          away_team: { name: "Away" },
          competition: null,
          home_team: { name: "Home" },
          id: "less-stale-match",
          kickoff_at: "2026-09-14T18:00:00.000Z",
        },
      ],
      new Date("2026-09-15T21:00:00.000Z"),
    );

    expect(summary).toEqual({
      count: 2,
      matches: [
        {
          competitionLabel: "Greatest Rivalry 2026",
          hoursOverdue: 72,
          matchId: "stale-match",
          matchLabel: "South Africa 対 New Zealand",
        },
        {
          competitionLabel: "",
          hoursOverdue: 27,
          matchId: "less-stale-match",
          matchLabel: "Home 対 Away",
        },
      ],
    });
  });
});
