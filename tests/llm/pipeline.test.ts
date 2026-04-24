import { beforeAll, describe, expect, it, vi } from "vitest";

import { generateMatchContent } from "@/lib/llm/pipeline";
import { ensureSupabaseTestEnvironment, insertMatchFixture } from "@/tests/db/helpers";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

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

    const row = await service
      .from("match_content")
      .select("status")
      .eq("match_id", matchId)
      .eq("content_type", "preview")
      .single();

    expect(row.error).toBeNull();
    expect(row.data?.status).toBe("draft");
  });
});
