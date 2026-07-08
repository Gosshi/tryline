import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  runDataIntegrityAudit: vi.fn(),
}));

const notifyMock = vi.hoisted(() => ({
  notifyDataIntegrityReport: vi.fn(),
}));

vi.mock("@/lib/data-integrity/audit", () => auditMock);
vi.mock("@/lib/llm/notify", () => notifyMock);

describe("/api/cron/audit-data-integrity", () => {
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

  it("rejects missing cron authorization", async () => {
    const { POST } = await import("@/app/api/cron/audit-data-integrity/route");

    const response = await POST(
      new Request("http://localhost/api/cron/audit-data-integrity", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(auditMock.runDataIntegrityAudit).not.toHaveBeenCalled();
  });

  it("returns the audit report and sends one notification", async () => {
    const report = {
      draftBacklog: { recent7Days: 1, total: 2 },
      duplicateEvents: { groupCount: 1, groups: [], matchCount: 2 },
      emptyFinishedEvents: { count: 3, matchIds: ["match-1"] },
      generatedAt: "2026-07-08T00:00:00.000Z",
      scoreMismatches: { count: 4, matches: [] },
      staleStandings: { competitions: [], count: 5 },
    };
    auditMock.runDataIntegrityAudit.mockResolvedValue(report);

    const { POST } = await import("@/app/api/cron/audit-data-integrity/route");

    const response = await POST(
      new Request("http://localhost/api/cron/audit-data-integrity", {
        headers: { Authorization: "Bearer test-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ report, status: "ok" });
    expect(notifyMock.notifyDataIntegrityReport).toHaveBeenCalledTimes(1);
    expect(notifyMock.notifyDataIntegrityReport).toHaveBeenCalledWith(report);
  });
});
