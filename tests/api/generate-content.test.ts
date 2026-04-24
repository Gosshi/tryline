import { beforeEach, describe, expect, it, vi } from "vitest";

const pipelineMock = vi.hoisted(() => ({
  generateMatchContent: vi.fn(),
}));

vi.mock("@/lib/llm/pipeline", () => pipelineMock);

describe("/api/cron/generate-content", () => {
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

    pipelineMock.generateMatchContent.mockResolvedValue({
      matchId: "5f9cbe48-fef1-41e0-8bb2-a9ecdf570d85",
      contentType: "preview",
      status: "published",
      qa: {
        scores: {
          information_density: 3,
          japanese_quality: 3,
          factual_grounding: 3,
        },
        issues: [],
        verdict: "publish",
      },
    });
  });

  it("returns 401 without a bearer token", async () => {
    const { POST } = await import("@/app/api/cron/generate-content/route");
    const response = await POST(
      new Request("http://localhost/api/cron/generate-content", {
        method: "POST",
        body: JSON.stringify({
          matchIds: ["5f9cbe48-fef1-41e0-8bb2-a9ecdf570d85"],
          contentType: "preview",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(pipelineMock.generateMatchContent).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct bearer token", async () => {
    const { POST } = await import("@/app/api/cron/generate-content/route");
    const response = await POST(
      new Request("http://localhost/api/cron/generate-content", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchIds: ["5f9cbe48-fef1-41e0-8bb2-a9ecdf570d85"],
          contentType: "preview",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(pipelineMock.generateMatchContent).toHaveBeenCalledWith(
      "5f9cbe48-fef1-41e0-8bb2-a9ecdf570d85",
      "preview",
    );
  });
});
