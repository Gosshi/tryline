import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getSupabaseServerClient: vi.fn(() => ({})) }));
const backfillMock = vi.hoisted(() => ({
  MAX_TOP14_LNR_MATCHES_PER_RUN: 7,
  runTop14LnrMatchEventBackfill: vi.fn(),
}));

vi.mock("@/lib/db/server", () => dbMock);
vi.mock("@/scripts/backfill-top14-lnr-match-events", () => backfillMock);

describe("/api/cron/ingest-top14-match-events", () => {
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
    process.env.WIKIPEDIA_SQUAD_URL = "https://example.invalid";
    backfillMock.runTop14LnrMatchEventBackfill.mockResolvedValue({
      eventsInserted: 13,
      targetMatches: 1,
    });
  });

  it("rejects an unauthorized request", async () => {
    const { POST } = await import("@/app/api/cron/ingest-top14-match-events/route");

    expect(
      await POST(new Request("http://localhost/api/cron/ingest-top14-match-events", { method: "POST" })),
    ).toMatchObject({ status: 401 });
  });

  it("runs the bounded non-dry-run backfill", async () => {
    const { POST } = await import("@/app/api/cron/ingest-top14-match-events/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-top14-match-events", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ eventsInserted: 13, targetMatches: 1 });
    expect(backfillMock.runTop14LnrMatchEventBackfill).toHaveBeenCalledWith(
      { dryRun: false, limit: 7 },
      expect.anything(),
    );
  });
});
