import { beforeEach, describe, expect, it, vi } from "vitest";

const calculationMock = vi.hoisted(() => ({
  calculateLatestTop14Standings: vi.fn(),
}));
const notificationMock = vi.hoisted(() => ({
  notifyStandingsIngestionIssue: vi.fn().mockResolvedValue(undefined),
}));
const cacheMock = vi.hoisted(() => ({
  PUBLIC_DATA_CACHE_TAGS: { standings: "standings" },
  revalidatePublicData: vi.fn(),
}));
vi.mock("@/scripts/calculate-standings", () => calculationMock);
vi.mock("@/lib/llm/notify", () => notificationMock);
vi.mock("@/lib/cache/public-data", () => cacheMock);

const dbMock = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(() => ({})),
}));
const backfillMock = vi.hoisted(() => ({
  MAX_TOP14_LNR_MATCHES_PER_RUN: 7,
  runTop14LnrMatchEventBackfill: vi.fn(),
}));

vi.mock("@/lib/db/server", () => dbMock);
vi.mock("@/scripts/backfill-top14-lnr-match-events", () => backfillMock);

describe("/api/cron/ingest-top14-match-events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    calculationMock.calculateLatestTop14Standings.mockResolvedValue({
      status: "updated",
      competitionSlug: "top-14-2026-27",
      upserted: 14,
    });
    notificationMock.notifyStandingsIngestionIssue.mockResolvedValue(undefined);
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
      failedMatches: [],
      targetMatches: 1,
    });
  });

  it("rejects an unauthorized request", async () => {
    const { POST } =
      await import("@/app/api/cron/ingest-top14-match-events/route");

    expect(
      await POST(
        new Request("http://localhost/api/cron/ingest-top14-match-events", {
          method: "POST",
        }),
      ),
    ).toMatchObject({ status: 401 });
  });

  it("runs the bounded non-dry-run backfill", async () => {
    const { POST } =
      await import("@/app/api/cron/ingest-top14-match-events/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-top14-match-events", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      eventsInserted: 13,
      failedMatches: [],
      targetMatches: 1,
      standings: {
        status: "updated",
        competitionSlug: "top-14-2026-27",
        upserted: 14,
      },
    });
    expect(calculationMock.calculateLatestTop14Standings).toHaveBeenCalledTimes(
      1,
    );
    expect(
      backfillMock.runTop14LnrMatchEventBackfill.mock.invocationCallOrder[0],
    ).toBeLessThan(
      calculationMock.calculateLatestTop14Standings.mock
        .invocationCallOrder[0]!,
    );
    expect(cacheMock.revalidatePublicData).toHaveBeenCalledWith("standings");
    expect(backfillMock.runTop14LnrMatchEventBackfill).toHaveBeenCalledWith(
      { dryRun: false, limit: 7 },
      expect.anything(),
    );
  });

  it("returns failed match details after the backfill completes", async () => {
    backfillMock.runTop14LnrMatchEventBackfill.mockResolvedValue({
      eventsInserted: 11,
      failedMatches: [
        {
          label: "Home v Away",
          matchId: "match-2",
          reason: "LNR game facts unavailable",
        },
      ],
      targetMatches: 3,
    });
    const { POST } =
      await import("@/app/api/cron/ingest-top14-match-events/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-top14-match-events", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(calculationMock.calculateLatestTop14Standings).toHaveBeenCalledTimes(
      1,
    );
    await expect(response.json()).resolves.toMatchObject({
      standings: { status: "updated" },
      error: "ingestion_failed",
      eventsInserted: 11,
      failedMatches: [expect.objectContaining({ matchId: "match-2" })],
      targetMatches: 3,
    });
  });

  it("returns the safe ingestion failure detail to the authorized caller", async () => {
    backfillMock.runTop14LnrMatchEventBackfill.mockRejectedValue(
      new Error("Top 14 event totals mismatch for match-1"),
    );
    const { POST } =
      await import("@/app/api/cron/ingest-top14-match-events/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-top14-match-events", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(
      calculationMock.calculateLatestTop14Standings,
    ).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      detail: "Top 14 event totals mismatch for match-1",
      error: "ingestion_failed",
    });
  });

  it("keeps successful event ingestion successful when standings calculation throws", async () => {
    calculationMock.calculateLatestTop14Standings.mockRejectedValue(
      new Error("standings unavailable"),
    );
    const { POST } =
      await import("@/app/api/cron/ingest-top14-match-events/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-top14-match-events", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).standings).toEqual({
      status: "failed",
      error: "standings unavailable",
    });
    expect(calculationMock.calculateLatestTop14Standings).toHaveBeenCalledTimes(
      1,
    );
    expect(
      notificationMock.notifyStandingsIngestionIssue,
    ).toHaveBeenCalledTimes(1);
    expect(cacheMock.revalidatePublicData).not.toHaveBeenCalled();
  });
  it("includes pending standings and checks whether an overdue alert is needed", async () => {
    calculationMock.calculateLatestTop14Standings.mockResolvedValue({
      competitionSlug: "top-14-2026-27",
      status: "skipped",
      reason: "events_pending",
      pendingMatchIds: ["pending-match"],
    });
    const { POST } =
      await import("@/app/api/cron/ingest-top14-match-events/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-top14-match-events", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).standings).toMatchObject({
      status: "skipped",
      reason: "events_pending",
    });
    expect(notificationMock.notifyStandingsIngestionIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        competition: "top-14-2026-27",
        pendingMatchIds: ["pending-match"],
      }),
    );
    expect(cacheMock.revalidatePublicData).not.toHaveBeenCalled();
  });
});
