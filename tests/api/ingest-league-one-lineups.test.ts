import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  client: { from: vi.fn() },
  getSupabaseServerClient: vi.fn(),
}));

const lineupsMock = vi.hoisted(() => ({
  ingestLeagueOneLineups: vi.fn(),
}));

vi.mock("@/lib/db/server", () => dbMock);
vi.mock("@/lib/ingestion/league-one-lineups", () => lineupsMock);

describe("/api/cron/ingest-league-one-lineups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";

    dbMock.getSupabaseServerClient.mockReturnValue(dbMock.client);
    lineupsMock.ingestLeagueOneLineups.mockResolvedValue({
      lineups_inserted: 46,
      no_lineup: 0,
      processed: 1,
      skipped_existing: 0,
      skipped_invalid_event_id: 0,
      skipped_not_league_one: 0,
      targets: 1,
    });
  });

  it("returns 401 without bearer token", async () => {
    const { POST } =
      await import("@/app/api/cron/ingest-league-one-lineups/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-league-one-lineups", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(lineupsMock.ingestLeagueOneLineups).not.toHaveBeenCalled();
  });

  it("ingests a single scheduled League One match by match id", async () => {
    const matchId = "96863688-cf14-40f8-b3d7-8d485ae5504b";
    const { POST } =
      await import("@/app/api/cron/ingest-league-one-lineups/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/ingest-league-one-lineups?match_id=${matchId}`,
        {
          headers: { Authorization: "Bearer test-cron-secret" },
          method: "POST",
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        lineups_inserted: 46,
        processed: 1,
      },
      status: "ok",
    });
    expect(lineupsMock.ingestLeagueOneLineups).toHaveBeenCalledWith({
      db: dbMock.client,
      matchId,
    });
  });

  it("rejects invalid match ids", async () => {
    const { POST } =
      await import("@/app/api/cron/ingest-league-one-lineups/route");
    const response = await POST(
      new Request(
        "http://localhost/api/cron/ingest-league-one-lineups?match_id=match_29559",
        {
          headers: { Authorization: "Bearer test-cron-secret" },
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(lineupsMock.ingestLeagueOneLineups).not.toHaveBeenCalled();
  });
});
