import { describe, expect, it, vi } from "vitest";

import { evaluateNarrativeQuality } from "@/lib/llm/stages/qa";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

describe("evaluateNarrativeQuality", () => {
  it("returns publish when all scores are >= 3", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: { information_density: 3, japanese_quality: 3, factual_grounding: 3 },
        issues: [],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      narrative: "body",
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("publish");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("returns retry when any score <= 2 and retry count < 2", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: { information_density: 2, japanese_quality: 3, factual_grounding: 3 },
        issues: ["x"],
        verdict: "retry",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({ contentType: "preview", narrative: "body", retryCount: 1 });
    expect(result.result.verdict).toBe("retry");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("returns reject when retry count is already 2", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: { information_density: 2, japanese_quality: 3, factual_grounding: 3 },
        issues: ["x"],
        verdict: "retry",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({ contentType: "preview", narrative: "body", retryCount: 2 });
    expect(result.result.verdict).toBe("reject");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });
});
