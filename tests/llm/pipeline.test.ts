import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

const notifyMock = vi.hoisted(() => ({
  notifyContentRejected: vi.fn(),
  notifyCostAlert: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);
vi.mock("@/lib/llm/notify", () => notifyMock);

import { generateMatchContent } from "@/lib/llm/pipeline";
import { ensureSupabaseTestEnvironment, insertMatchFixture } from "@/tests/db/helpers";

describe("generateMatchContent", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  beforeEach(() => {
    openAIMock.createTextResponse.mockReset();
    notifyMock.notifyContentRejected.mockReset();
    notifyMock.notifyCostAlert.mockReset();
  });

  it("writes published content when QA passes", async () => {
    const { matchId, service } = await insertMatchFixture();

    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: [
            { point: "A", detail: "a", evidence: ["1"] },
            { point: "B", detail: "b", evidence: ["2"] },
            { point: "C", detail: "c", evidence: ["3"] },
          ],
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 500 },
      })
      .mockResolvedValueOnce({
        text: "# narrative",
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: { information_density: 4, japanese_quality: 4, factual_grounding: 4 },
          issues: [],
          verdict: "publish",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      });

    const result = await generateMatchContent(matchId, "preview");

    expect(result.status).toBe("published");
    expect(notifyMock.notifyContentRejected).not.toHaveBeenCalled();
    expect(notifyMock.notifyCostAlert).not.toHaveBeenCalled();

    const row = await service
      .from("match_content")
      .select("status")
      .eq("match_id", matchId)
      .eq("content_type", "preview")
      .single();

    expect(row.error).toBeNull();
    expect(row.data?.status).toBe("published");
  });

  it("writes draft content when QA ends with reject", async () => {
    const { matchId, service } = await insertMatchFixture();

    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: [
            { point: "A", detail: "a", evidence: ["1"] },
            { point: "B", detail: "b", evidence: ["2"] },
            { point: "C", detail: "c", evidence: ["3"] },
          ],
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 500 },
      })
      .mockResolvedValueOnce({
        text: "# narrative-1",
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: { information_density: 2, japanese_quality: 3, factual_grounding: 3 },
          issues: ["retry"],
          verdict: "retry",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      })
      .mockResolvedValueOnce({
        text: "# narrative-2",
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: { information_density: 2, japanese_quality: 3, factual_grounding: 3 },
          issues: ["retry"],
          verdict: "retry",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      })
      .mockResolvedValueOnce({
        text: "# narrative-3",
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 3500, outputTokens: 2500 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: { information_density: 2, japanese_quality: 3, factual_grounding: 3 },
          issues: ["reject"],
          verdict: "retry",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 3000, outputTokens: 200 },
      });

    const result = await generateMatchContent(matchId, "preview");

    expect(result.status).toBe("draft");
    expect(notifyMock.notifyContentRejected).toHaveBeenCalledWith(matchId, "preview", result.qa);

    const row = await service
      .from("match_content")
      .select("status")
      .eq("match_id", matchId)
      .eq("content_type", "preview")
      .single();

    expect(row.error).toBeNull();
    expect(row.data?.status).toBe("draft");
  });

  it("notifies cost alert when total cost exceeds threshold", async () => {
    const { matchId } = await insertMatchFixture();

    openAIMock.createTextResponse
      .mockResolvedValueOnce({
        text: JSON.stringify({
          tactical_points: [
            { point: "A", detail: "a", evidence: ["1"] },
            { point: "B", detail: "b", evidence: ["2"] },
            { point: "C", detail: "c", evidence: ["3"] },
          ],
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 5_000_000, outputTokens: 1_000_000 },
      })
      .mockResolvedValueOnce({
        text: "# expensive narrative",
        model: "gpt-4o-2024-11-20",
        usage: { inputTokens: 5_000_000, outputTokens: 5_000_000 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          scores: { information_density: 4, japanese_quality: 4, factual_grounding: 4 },
          issues: [],
          verdict: "publish",
        }),
        model: "gpt-4o-mini-2024-07-18",
        usage: { inputTokens: 5_000_000, outputTokens: 1_000_000 },
      });

    await generateMatchContent(matchId, "preview");

    expect(notifyMock.notifyCostAlert).toHaveBeenCalledTimes(1);
    expect(notifyMock.notifyCostAlert).toHaveBeenCalledWith(matchId, "preview", expect.any(Number), 0.2);
    expect((notifyMock.notifyCostAlert.mock.calls[0] ?? [])[2]).toBeGreaterThan(0.2);
  });
});
