import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  competition: null as null | { id: string; season: string; slug: string },
  getSupabaseServerClient: vi.fn(),
}));

const scraperMocks = vi.hoisted(() => ({
  fetchLeagueOneMatchDetail: vi.fn(),
  fetchLeagueOnePlayoffMatchRefs: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: dbMock.getSupabaseServerClient,
}));
vi.mock("@/lib/scrapers/league-one-match", () => ({
  fetchLeagueOneMatchDetail: scraperMocks.fetchLeagueOneMatchDetail,
}));
vi.mock("@/lib/scrapers/wikipedia-league-one-playoffs", () => ({
  fetchLeagueOnePlayoffMatchRefs: scraperMocks.fetchLeagueOnePlayoffMatchRefs,
}));

function createCompetitionQuery() {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: dbMock.competition, error: null }),
    ),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  return query;
}

describe("/api/cron/fill-league-one-playoff-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
    dbMock.competition = null;
    dbMock.getSupabaseServerClient.mockImplementation(() => ({
      from: vi.fn(() => createCompetitionQuery()),
    }));
  });

  it("returns 200 no-op when no active competition is found automatically", async () => {
    const { POST } =
      await import("@/app/api/cron/fill-league-one-playoff-events/route");
    const response = await POST(
      new Request("http://localhost/api/cron/fill-league-one-playoff-events", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      skipped: "no_active_league_one_competition",
    });
    expect(scraperMocks.fetchLeagueOnePlayoffMatchRefs).not.toHaveBeenCalled();
  });

  it("returns 404 when an explicitly requested season is not found", async () => {
    const { POST } =
      await import("@/app/api/cron/fill-league-one-playoff-events/route");
    const response = await POST(
      new Request("http://localhost/api/cron/fill-league-one-playoff-events", {
        body: JSON.stringify({ season: "2025-26" }),
        headers: {
          Authorization: "Bearer test-cron-secret",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "league_one_competition_not_found",
    });
    expect(scraperMocks.fetchLeagueOnePlayoffMatchRefs).not.toHaveBeenCalled();
  });
});
