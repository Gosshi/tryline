import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  parseMatchLineupFromHtml: vi.fn(),
  resolveAvailablePlayerSlugs: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({
  assertCronAuthorized: vi.fn(),
  CronUnauthorizedError: class CronUnauthorizedError extends Error {},
}));
vi.mock("@/lib/db/player-slug", () => ({
  resolveAvailablePlayerSlugs: mocks.resolveAvailablePlayerSlugs,
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: mocks.getSupabaseServerClient,
}));
vi.mock("@/lib/scrapers/fetcher", () => ({
  fetchWithPolicy: mocks.fetchWithPolicy,
}));
vi.mock("@/lib/scrapers/wikipedia-lineups", () => ({
  parseMatchLineupFromHtml: mocks.parseMatchLineupFromHtml,
}));

const MATCH_ID = "00000000-0000-4000-8000-000000000000";
const HOME_TEAM_ID = "10000000-0000-4000-8000-000000000000";
const AWAY_TEAM_ID = "20000000-0000-4000-8000-000000000000";

function createPlayers(prefix: string) {
  return Array.from({ length: 15 }, (_, index) => ({
    jersey_number: index + 1,
    name: `${prefix} Player ${index + 1}`,
  }));
}

function createMockDb(params: { awayResolved: number; homeResolved: number }) {
  const lineupQueries = {
    delete: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  const deleteQuery = {
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockResolvedValue({ error: null }),
  };
  lineupQueries.delete.mockReturnValue(deleteQuery);

  return {
    db: {
      from: vi.fn((table: string) => {
        if (table === "matches") {
          return {
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                away_team: { name: "Away" },
                away_team_id: AWAY_TEAM_ID,
                external_ids: {
                  wikipedia_url: "https://en.wikipedia.org/wiki/match",
                },
                home_team: { name: "Home" },
                home_team_id: HOME_TEAM_ID,
                id: MATCH_ID,
                kickoff_at: "2026-08-30T00:00:00.000Z",
              },
              error: null,
            }),
            select: vi.fn().mockReturnThis(),
          };
        }

        if (table === "players") {
          const state: { names: string[]; teamId: string | null } = {
            names: [],
            teamId: null,
          };
          const playerQuery = {
            eq: vi.fn((column: string, value: string) => {
              if (column === "team_id") {
                state.teamId = value;
              }
              return playerQuery;
            }),
            in: vi.fn((column: string, value: string[]) => {
              if (column === "name") {
                state.names = value;
              }
              return playerQuery;
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: vi.fn().mockReturnThis(),
            then: (
              resolve: (value: {
                data: Array<{ id: string; name: string }>;
                error: null;
              }) => unknown,
            ) => {
              const resolvedCount =
                state.teamId === HOME_TEAM_ID
                  ? params.homeResolved
                  : params.awayResolved;
              const returnedCount =
                state.names.length === 15 ? resolvedCount : 0;
              return Promise.resolve(
                resolve({
                  data: state.names.slice(0, returnedCount).map((name) => ({
                    id: `${state.teamId}-${name}`,
                    name,
                  })),
                  error: null,
                }),
              );
            },
          };
          return playerQuery;
        }

        if (table === "match_lineups") {
          return lineupQueries;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    deleteQuery,
    lineupQueries,
  };
}

describe("/api/cron/ingest-lineups replacement integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.fetchWithPolicy.mockResolvedValue(new Response("<html></html>"));
    mocks.parseMatchLineupFromHtml.mockReturnValue({
      announced_at: "2026-08-30T00:00:00.000Z",
      away_players: createPlayers("Away"),
      home_players: createPlayers("Home"),
      source_url: "https://en.wikipedia.org/wiki/match",
    });
    mocks.resolveAvailablePlayerSlugs.mockImplementation(
      async (names: string[]) => names.map((name) => name.toLowerCase()),
    );
  });

  it("does not replace a fully parsed team when some player IDs are unresolved", async () => {
    const { db, deleteQuery, lineupQueries } = createMockDb({
      awayResolved: 15,
      homeResolved: 12,
    });
    mocks.getSupabaseServerClient.mockReturnValue(db);

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${MATCH_ID}`,
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      away_count: 15,
      home_count: 0,
      skipped_teams: ["home"],
    });
    expect(lineupQueries.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ team_id: AWAY_TEAM_ID }),
      ]),
      { onConflict: "match_id,team_id,jersey_number" },
    );
    expect(lineupQueries.upsert.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ team_id: HOME_TEAM_ID }),
      ]),
    );
    expect(deleteQuery.not).toHaveBeenCalledTimes(1);
    expect(deleteQuery.eq).not.toHaveBeenCalledWith("team_id", HOME_TEAM_ID);
  });

  it("does not delete a team when no parsed player IDs can be resolved", async () => {
    const { db, deleteQuery, lineupQueries } = createMockDb({
      awayResolved: 15,
      homeResolved: 0,
    });
    mocks.getSupabaseServerClient.mockReturnValue(db);

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-lineups?match_id=${MATCH_ID}`,
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      away_count: 15,
      home_count: 0,
      skipped_teams: ["home"],
    });
    expect(deleteQuery.not).toHaveBeenCalledTimes(1);
    expect(deleteQuery.not).not.toHaveBeenCalledWith(
      "jersey_number",
      "in",
      "()",
    );
    expect(lineupQueries.upsert.mock.calls[0]?.[0]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ team_id: HOME_TEAM_ID }),
      ]),
    );
  });
});
