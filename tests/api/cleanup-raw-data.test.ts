import { beforeEach, describe, expect, it, vi } from "vitest";

const retentionMock = vi.hoisted(() => ({
  cleanupExpiredRawData: vi.fn(),
}));

vi.mock("@/lib/retention/cleanup-raw-data", () => retentionMock);

describe("/api/cron/cleanup-raw-data", () => {
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

    retentionMock.cleanupExpiredRawData.mockResolvedValue({
      deletedRows: 2,
      durationMs: 17,
    });
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await import("@/app/api/cron/cleanup-raw-data/route");
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-raw-data", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "unauthorized" });
    expect(retentionMock.cleanupExpiredRawData).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct bearer token", async () => {
    const { POST } = await import("@/app/api/cron/cleanup-raw-data/route");
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-raw-data", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      deleted_rows: 2,
      duration_ms: 17,
    });
    expect(retentionMock.cleanupExpiredRawData).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when cleanup fails", async () => {
    retentionMock.cleanupExpiredRawData.mockRejectedValueOnce(
      new Error("db failure"),
    );

    const { POST } = await import("@/app/api/cron/cleanup-raw-data/route");
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup-raw-data", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "internal_error" });
  });
});
