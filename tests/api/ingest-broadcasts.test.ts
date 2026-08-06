import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestMock = vi.hoisted(() => ({
  runBroadcastIngest: vi.fn(),
}));
const notifyMock = vi.hoisted(() => ({
  notifyBroadcastIngestReport: vi.fn(),
}));

vi.mock("@/lib/broadcasts/ingest", () => ingestMock);
vi.mock("@/lib/llm/notify", () => notifyMock);

const report = {
  generatedAt: "2026-08-06T00:00:00.000Z",
  linked: [],
  matchesStillMissing: [],
  unknownServices: [],
  unlinkedPages: [],
};

describe("/api/cron/ingest-broadcasts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
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
  });

  it("returns 401 without cron authorization", async () => {
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(ingestMock.runBroadcastIngest).not.toHaveBeenCalled();
  });

  it("returns the result and sends its notification", async () => {
    ingestMock.runBroadcastIngest.mockResolvedValue(report);
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: report,
      status: "ok",
    });
    expect(notifyMock.notifyBroadcastIngestReport).toHaveBeenCalledWith(report);
  });
});
