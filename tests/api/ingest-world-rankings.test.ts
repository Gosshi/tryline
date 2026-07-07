import { beforeEach, describe, expect, it, vi } from "vitest";

const rankingsMock = vi.hoisted(() => ({
  ingestWorldRugbyRankings: vi.fn(),
}));

vi.mock("@/lib/ingestion/world-rankings", () => rankingsMock);

describe("/api/cron/ingest-world-rankings", () => {
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

    rankingsMock.ingestWorldRugbyRankings.mockResolvedValue({
      parsed: 30,
      unmatched: [],
      updated: 10,
    });
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await import(
      "@/app/api/cron/ingest-world-rankings/route"
    );
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-world-rankings", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(rankingsMock.ingestWorldRugbyRankings).not.toHaveBeenCalled();
  });

  it("returns ingestion counts", async () => {
    const { POST } = await import(
      "@/app/api/cron/ingest-world-rankings/route"
    );
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-world-rankings", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: { parsed: 30, unmatched: [], updated: 10 },
      status: "ok",
    });
    expect(rankingsMock.ingestWorldRugbyRankings).toHaveBeenCalledTimes(1);
  });
});
