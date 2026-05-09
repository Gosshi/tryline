import { beforeEach, describe, expect, it, vi } from "vitest";

const liveCompetitionsMock = vi.hoisted(() => ({
  ingestAllLiveCompetitions: vi.fn(),
}));

vi.mock("@/lib/ingestion/live-competitions", () => liveCompetitionsMock);

describe("/api/cron/ingest-live-competitions", () => {
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

    liveCompetitionsMock.ingestAllLiveCompetitions.mockResolvedValue([
      {
        competition: "super-rugby-pacific-2026",
        counts: { matches_inserted: 1, matches_updated: 0 },
      },
    ]);
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await import(
      "@/app/api/cron/ingest-live-competitions/route"
    );
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-live-competitions", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(liveCompetitionsMock.ingestAllLiveCompetitions).not.toHaveBeenCalled();
  });

  it("returns 200 with all live competition results", async () => {
    const { POST } = await import(
      "@/app/api/cron/ingest-live-competitions/route"
    );
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-live-competitions", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      results: [
        {
          competition: "super-rugby-pacific-2026",
          counts: { matches_inserted: 1, matches_updated: 0 },
        },
      ],
      status: "ok",
    });
    expect(liveCompetitionsMock.ingestAllLiveCompetitions).toHaveBeenCalledTimes(
      1,
    );
  });
});
