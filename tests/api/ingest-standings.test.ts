import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache/public-data", () => ({
  PUBLIC_DATA_CACHE_TAGS: { standings: "public-data:standings" },
  revalidatePublicData: vi.fn(),
}));

const standingsMock = vi.hoisted(() => ({
  ingestWeeklyStandings: vi.fn(),
}));

vi.mock("@/lib/ingestion/weekly-standings", () => standingsMock);

describe("/api/cron/ingest-standings", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.CRON_SECRET = "test-secret";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  it("rejects missing cron authorization", async () => {
    const { POST } = await import("@/app/api/cron/ingest-standings/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-standings", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(standingsMock.ingestWeeklyStandings).not.toHaveBeenCalled();
  });

  it("ingests latest standings for the weekly cron", async () => {
    standingsMock.ingestWeeklyStandings.mockResolvedValue({
      failed: 0,
      results: [
        {
          competitionSlug: "top-14-2025-26",
          family: "top-14",
          matched: 14,
          parsed: 14,
          season: "2025-26",
          status: "updated",
          upserted: 14,
        },
      ],
      skipped: 0,
      updated: 14,
    });

    const { POST } = await import("@/app/api/cron/ingest-standings/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-standings", {
        headers: {
          authorization: "Bearer test-secret",
        },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.result.updated).toBe(14);
    expect(standingsMock.ingestWeeklyStandings).toHaveBeenCalledTimes(1);
  });
});
