import { beforeEach, describe, expect, it, vi } from "vitest";

const fixturesMock = vi.hoisted(() => ({
  ingestSixNations2027Fixtures: vi.fn(),
}));

vi.mock("@/lib/ingestion/fixtures", () => fixturesMock);

describe("/api/cron/ingest-fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";

    fixturesMock.ingestSixNations2027Fixtures.mockResolvedValue({
      competition: "six-nations-2027",
      counts: {
        matches_inserted: 2,
        matches_updated: 0,
        raw_data_rows: 2,
      },
    });
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-fixtures", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(fixturesMock.ingestSixNations2027Fixtures).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-fixtures", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      competition: "six-nations-2027",
      counts: {
        matches_inserted: 2,
        matches_updated: 0,
        raw_data_rows: 2,
      },
      status: "ok",
    });
    expect(fixturesMock.ingestSixNations2027Fixtures).toHaveBeenCalledTimes(1);
  });
});
