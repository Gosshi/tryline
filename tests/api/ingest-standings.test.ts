import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cache/public-data", () => ({
  PUBLIC_DATA_CACHE_TAGS: { standings: "public-data:standings" },
  revalidatePublicData: vi.fn(),
}));

const standingsMock = vi.hoisted(() => ({
  ingestWeeklyStandings: vi.fn(),
}));
const notificationMock = vi.hoisted(() => ({
  notifyStandingsIngestionIssue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/llm/notify", () => notificationMock);

const calculationMock = vi.hoisted(() => ({
  calculateLatestTop14Standings: vi.fn(),
}));

vi.mock("@/lib/ingestion/weekly-standings", () => standingsMock);
vi.mock("@/scripts/calculate-standings", () => calculationMock);

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

  it("only ingests weekly standings and omits the top14 result", async () => {
    const weekly = { failed: 0, results: [], skipped: 0, updated: 4 };
    standingsMock.ingestWeeklyStandings.mockResolvedValue(weekly);
    const { POST } = await import("@/app/api/cron/ingest-standings/route");
    const response = await POST(new Request("http://localhost/api/cron/ingest-standings", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).result).toEqual({ weekly });
    expect(standingsMock.ingestWeeklyStandings).toHaveBeenCalledTimes(1);
    expect(calculationMock.calculateLatestTop14Standings).not.toHaveBeenCalled();
    expect(notificationMock.notifyStandingsIngestionIssue).not.toHaveBeenCalled();
  });
  it("returns 500 when weekly ingestion fails without invoking Top 14", async () => {
    standingsMock.ingestWeeklyStandings.mockRejectedValue(new Error("wikipedia unavailable"));
    const { POST } = await import("@/app/api/cron/ingest-standings/route");
    const response = await POST(new Request("http://localhost/api/cron/ingest-standings", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
    expect(response.status).toBe(500);
    expect(calculationMock.calculateLatestTop14Standings).not.toHaveBeenCalled();
  });
  it("returns 200 and alerts once for a failed Wikipedia family", async () => {
    standingsMock.ingestWeeklyStandings.mockResolvedValue({ failed: 1, results: [
      { family: "premiership", status: "failed", error: "Wikipedia unavailable", matched: 0, parsed: 0, upserted: 0 },
      { family: "pnc", status: "skipped", reason: "no_rows_parsed" },
    ], skipped: 1, updated: 0 });
    const { POST } = await import("@/app/api/cron/ingest-standings/route");
    const response = await POST(new Request("http://localhost/api/cron/ingest-standings", { method: "POST", headers: { authorization: "Bearer test-secret" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).result.weekly.failed).toBe(1);
    expect(notificationMock.notifyStandingsIngestionIssue).toHaveBeenCalledExactlyOnceWith({ competition: "premiership", status: "failed", error: "Wikipedia unavailable" });
    expect(calculationMock.calculateLatestTop14Standings).not.toHaveBeenCalled();
  });
});
