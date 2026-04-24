import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestrateMock = vi.hoisted(() => ({
  runOrchestrate: vi.fn(),
}));

vi.mock("@/lib/cron/orchestrate", () => orchestrateMock);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/llm/pipeline", () => ({
  generateMatchContent: vi.fn(),
}));

describe("/api/cron/orchestrate", () => {
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

    orchestrateMock.runOrchestrate.mockResolvedValue({
      previews: { triggered: 1, skipped: 0 },
      lineups: { triggered: 1, no_url: 0 },
      recaps: { triggered: 0, skipped: 0 },
    });
  });

  it("returns 401 without bearer token", async () => {
    const { POST } = await import("@/app/api/cron/orchestrate/route");
    const response = await POST(new Request("http://localhost/api/cron/orchestrate", { method: "POST" }));

    expect(response.status).toBe(401);
  });

  it("returns 200 with orchestration result", async () => {
    const { POST } = await import("@/app/api/cron/orchestrate/route");
    const response = await POST(
      new Request("http://localhost/api/cron/orchestrate", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      previews: { triggered: 1, skipped: 0 },
      lineups: { triggered: 1, no_url: 0 },
      recaps: { triggered: 0, skipped: 0 },
    });
  });
});
