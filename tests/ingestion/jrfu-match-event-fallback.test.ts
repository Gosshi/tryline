import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));
const eventMocks = vi.hoisted(() => ({
  upsertMatchEvents: vi.fn(),
}));
const scraperMocks = vi.hoisted(() => ({
  fetchJrfuMatchEvents: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: dbMocks.getSupabaseServerClient,
}));
vi.mock("@/lib/ingestion/events", () => eventMocks);
vi.mock("@/lib/scrapers/jrfu-match-events", () => scraperMocks);

import {
  applyJrfuMatchEventFallback,
  JRFU_MATCH_EVENT_FALLBACK_LIMIT,
} from "@/lib/ingestion/jrfu-match-event-fallback";

type MatchRow = {
  away_score: number | null;
  away_team: { id: string; slug: string } | null;
  home_score: number | null;
  home_team: { id: string; slug: string } | null;
  id: string;
  kickoff_at: string;
};

function createMatch(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    away_score: 0,
    away_team: { id: "canada-id", slug: "canada" },
    home_score: 7,
    home_team: { id: "japan-id", slug: "japan" },
    id: "japan-canada",
    kickoff_at: "2026-09-05T05:50:00.000Z",
    ...overrides,
  };
}

function createResult(overrides: Record<string, unknown> = {}) {
  return {
    dateJrfu: "2026-09-05",
    japanScore: 7,
    matchUrl: "https://www.rugby-japan.jp/match/29975",
    opponentName: "カナダ代表",
    opponentScore: 0,
    ...overrides,
  };
}

function createClient(rows: MatchRow[], existingMatchIds = new Set<string>()) {
  const eventCounts = vi.fn((matchId: string) =>
    Promise.resolve({
      count: existingMatchIds.has(matchId) ? 1 : 0,
      error: null,
    }),
  );
  const matchesQuery = {
    or: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    select: vi.fn(() => matchesQuery),
  };
  const teamsQuery = {
    eq: vi.fn(() => teamsQuery),
    select: vi.fn(() => teamsQuery),
    single: vi.fn(() =>
      Promise.resolve({ data: { id: "japan-id" }, error: null }),
    ),
  };

  dbMocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "teams") {
        return teamsQuery;
      }

      if (table === "matches") {
        return matchesQuery;
      }

      if (table === "match_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_: string, matchId: string) => eventCounts(matchId)),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  });

  return { eventCounts };
}

const scoreMatchingEvents = [
  {
    isPenaltyTry: false,
    minute: 5,
    playerName: "岡部崇人",
    teamSide: "home" as const,
    type: "try" as const,
  },
  {
    isPenaltyTry: false,
    minute: 6,
    playerName: "松永拓朗",
    teamSide: "home" as const,
    type: "conversion" as const,
  },
];

describe("JRFU match event fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMocks.upsertMatchEvents.mockResolvedValue({ inserted: 2 });
    scraperMocks.fetchJrfuMatchEvents.mockResolvedValue({
      events: scoreMatchingEvents,
      hasUnsupportedScoringEvent: false,
    });
  });

  it("inserts score-matching events for an eventless Japan match", async () => {
    createClient([createMatch()]);

    await expect(
      applyJrfuMatchEventFallback([createResult()]),
    ).resolves.toEqual({
      counts: {
        existing_events_skipped: 0,
        match_limit_skipped: 0,
        matches_inserted: 1,
        score_mismatches_skipped: 0,
        unresolved_player_names: 0,
        unsupported_timeline_skipped: 0,
      },
      source: "jrfu-match-events",
    });
    expect(eventMocks.upsertMatchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeamId: "canada-id",
        events: scoreMatchingEvents,
        homeTeamId: "japan-id",
        matchId: "japan-canada",
      }),
    );
  });

  it("skips a score mismatch before it can call the destructive upsert", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createClient([createMatch({ home_score: 8 })]);

    await expect(
      applyJrfuMatchEventFallback([createResult()]),
    ).resolves.toMatchObject({
      counts: { matches_inserted: 0, score_mismatches_skipped: 1 },
    });
    expect(eventMocks.upsertMatchEvents).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[jrfu-match-event-fallback] event total mismatch; skipped",
      expect.objectContaining({
        actualScore: { away: 0, home: 7 },
        expectedScore: { away: 0, home: 8 },
      }),
    );
    warn.mockRestore();
  });

  it("does not fetch or upsert a match that already has events", async () => {
    createClient([createMatch()], new Set(["japan-canada"]));

    await expect(
      applyJrfuMatchEventFallback([createResult()]),
    ).resolves.toMatchObject({
      counts: { existing_events_skipped: 1, matches_inserted: 0 },
    });
    expect(scraperMocks.fetchJrfuMatchEvents).not.toHaveBeenCalled();
    expect(eventMocks.upsertMatchEvents).not.toHaveBeenCalled();
  });

  it("continues after an unresolved player and reports the name", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    createClient([createMatch()]);
    eventMocks.upsertMatchEvents.mockImplementation(
      async (params: {
        onUnresolvedPlayer: (player: {
          playerName: string;
          teamId: string;
        }) => void;
      }) => {
        params.onUnresolvedPlayer({
          playerName: "岡部崇人",
          teamId: "japan-id",
        });
        return { inserted: 2 };
      },
    );

    await expect(
      applyJrfuMatchEventFallback([createResult()]),
    ).resolves.toMatchObject({
      counts: { matches_inserted: 1, unresolved_player_names: 1 },
    });
    expect(warn).toHaveBeenCalledWith(
      "[jrfu-match-event-fallback] unresolved player",
      { matchId: "japan-canada", playerName: "岡部崇人" },
    );
    warn.mockRestore();
  });

  it("limits match-page requests to the configured maximum", async () => {
    const rows = Array.from(
      { length: JRFU_MATCH_EVENT_FALLBACK_LIMIT + 1 },
      (_, index) =>
        createMatch({
          id: `japan-canada-${index}`,
          kickoff_at: `2026-08-${String(index * 3 + 1).padStart(2, "0")}T05:50:00.000Z`,
        }),
    );
    const results = rows.map((_, index) =>
      createResult({
        dateJrfu: `2026-08-${String(index * 3 + 1).padStart(2, "0")}`,
        matchUrl: `https://www.rugby-japan.jp/match/${index}`,
      }),
    );
    createClient(rows);

    await expect(applyJrfuMatchEventFallback(results)).resolves.toMatchObject({
      counts: {
        match_limit_skipped: 1,
        matches_inserted: JRFU_MATCH_EVENT_FALLBACK_LIMIT,
      },
    });
    expect(scraperMocks.fetchJrfuMatchEvents).toHaveBeenCalledTimes(
      JRFU_MATCH_EVENT_FALLBACK_LIMIT,
    );
  });
});
