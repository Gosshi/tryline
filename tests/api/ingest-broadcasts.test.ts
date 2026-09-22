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
  changes: [],
  generatedAt: "2026-08-06T00:00:00.000Z",
  linked: [],
  matchesStillMissing: [],
  unknownServices: [],
  unlinkedPages: [],
  pageErrors: [],
  requiresReconfirmation: [],
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

  it.each([
    {
      name: "an unlinked page",
      report: { ...report, unlinkedPages: [{ dateLabel: "11.07 Sat" }] },
    },
    {
      name: "a match still missing broadcasts",
      report: { ...report, matchesStillMissing: [{ matchId: "match-1" }] },
    },
  ])(
    "returns 200 when nothing linked and there is $name",
    async ({ report }) => {
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
      expect(notifyMock.notifyBroadcastIngestReport).toHaveBeenCalledWith(
        report,
      );
    },
  );

  it.each([
    new Error("JRFU schedule fetch failed"),
    new Error("database write failed"),
  ])("returns 500 for an ingest technical failure", async (error) => {
    ingestMock.runBroadcastIngest.mockRejectedValueOnce(error);
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: error.message });
  });

  it("returns 500 when sending the report fails", async () => {
    const error = new Error("broadcast notification failed");
    ingestMock.runBroadcastIngest.mockResolvedValue(report);
    notifyMock.notifyBroadcastIngestReport.mockRejectedValueOnce(error);
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: error.message });
  });

  it("returns 200 when nothing needs linking", async () => {
    ingestMock.runBroadcastIngest.mockResolvedValue(report);
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns 500 after reporting an individual JRFU page failure", async () => {
    const failedReport = {
      ...report,
      pageErrors: [
        {
          message: "invalid JRFU page",
          sourceUrl: "https://www.rugby-japan.jp/match/failed",
        },
      ],
    };
    ingestMock.runBroadcastIngest.mockResolvedValue(failedReport);
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(notifyMock.notifyBroadcastIngestReport).toHaveBeenCalledWith(
      failedReport,
    );
  });

  it("returns 200 when at least one broadcast was linked", async () => {
    const linkedReport = {
      ...report,
      linked: [
        {
          kind: "tv",
          label: "日本 対 ウェールズ",
          matchId: "match-1",
          serviceName: "BS日テレ",
        },
      ],
      unlinkedPages: [{ dateLabel: "09.19 Sat" }],
    };
    ingestMock.runBroadcastIngest.mockResolvedValue(linkedReport);
    const { POST } = await import("@/app/api/cron/ingest-broadcasts/route");

    const response = await POST(
      new Request("http://localhost/api/cron/ingest-broadcasts", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: linkedReport,
      status: "ok",
    });
  });
});
