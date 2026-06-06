import { beforeEach, describe, expect, it, vi } from "vitest";

const sourcedFactsMock = vi.hoisted(() => ({
  fetchSourcedFactsForMatch: vi.fn(),
}));

vi.mock("@/lib/llm/sourced-facts/fetch", () => sourcedFactsMock);

describe("/api/cron/fetch-sourced-facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";

    sourcedFactsMock.fetchSourcedFactsForMatch.mockResolvedValue({
      cached: true,
      facts: [],
      fetched: false,
      skippedReason: null,
    });
  });

  it("accepts a valid UUID match id and does not return 400", async () => {
    const matchId = "0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64";
    const { POST } = await import("@/app/api/cron/fetch-sourced-facts/route");
    const response = await POST(
      new Request(
        `http://localhost/api/cron/fetch-sourced-facts?match_id=${matchId}&content_type=preview`,
        {
          headers: { Authorization: "Bearer test-cron-secret" },
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(sourcedFactsMock.fetchSourcedFactsForMatch).toHaveBeenCalledWith({
      contentType: "preview",
      force: false,
      matchId,
    });
  });

  it("rejects invalid UUID match ids", async () => {
    const { POST } = await import("@/app/api/cron/fetch-sourced-facts/route");
    const response = await POST(
      new Request(
        "http://localhost/api/cron/fetch-sourced-facts?match_id=match_1&content_type=preview",
        {
          headers: { Authorization: "Bearer test-cron-secret" },
          method: "POST",
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(sourcedFactsMock.fetchSourcedFactsForMatch).not.toHaveBeenCalled();
  });
});
