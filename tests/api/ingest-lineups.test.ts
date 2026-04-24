import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureSupabaseTestEnvironment, insertMatchFixture } from "@/tests/db/helpers";

const lineupsMock = vi.hoisted(() => ({
  scrapeMatchLineup: vi.fn(),
}));

vi.mock("@/lib/scrapers/wikipedia-lineups", () => lineupsMock);

describe("/api/cron/ingest-lineups", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  it("returns 401 without bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(new Request("http://localhost/api/cron/ingest-lineups?match_id=00000000-0000-4000-8000-000000000000", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("returns announced false when lineup is not published", async () => {
    const { matchId, service } = await insertMatchFixture();
    await service.from("matches").update({ external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" } }).eq("id", matchId);
    lineupsMock.scrapeMatchLineup.mockResolvedValue(null);

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(`http://localhost/api/cron/ingest-lineups?match_id=${matchId}`, {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ announced: false });
  });

  it("inserts missing players and upserts match_lineups", async () => {
    const { matchId, homeTeamId, awayTeamId, service } = await insertMatchFixture();
    await service.from("matches").update({ external_ids: { wikipedia_url: "https://en.wikipedia.org/wiki/match" } }).eq("id", matchId);

    lineupsMock.scrapeMatchLineup.mockResolvedValue({
      source_url: "https://en.wikipedia.org/wiki/match",
      announced_at: new Date().toISOString(),
      home_players: [
        { jersey_number: 1, name: "Home New Player" },
        { jersey_number: 16, name: "Home Bench Player" },
      ],
      away_players: [
        { jersey_number: 1, name: "Away New Player" },
      ],
    });

    const { POST } = await import("@/app/api/cron/ingest-lineups/route");
    const response = await POST(
      new Request(`http://localhost/api/cron/ingest-lineups?match_id=${matchId}`, {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ announced: true, home_count: 2, away_count: 1 });

    const players = await service.from("players").select("team_id, name").in("name", ["Home New Player", "Away New Player"]);
    expect(players.error).toBeNull();
    expect(players.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ team_id: homeTeamId, name: "Home New Player" }),
        expect.objectContaining({ team_id: awayTeamId, name: "Away New Player" }),
      ]),
    );

    const lineups = await service
      .from("match_lineups")
      .select("team_id, jersey_number")
      .eq("match_id", matchId)
      .order("team_id", { ascending: true });

    expect(lineups.error).toBeNull();
    expect(lineups.data?.length).toBe(3);
  });
});
