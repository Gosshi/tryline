import { describe, expect, it, vi } from "vitest";

import { evaluateNarrativeQuality } from "@/lib/llm/stages/qa";

const openAIMock = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
}));

vi.mock("@/lib/llm/openai", () => openAIMock);

const matchContext = {
  awayScore: 17,
  awayTeam: "France",
  homeScore: 24,
  homeTeam: "Ireland",
};

describe("evaluateNarrativeQuality", () => {
  it("returns publish when all scores are >= 3", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 3,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: [],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
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
        scores: {
          factual_grounding: 3,
          information_density: 2,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: ["x"],
        verdict: "retry",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: "body",
      retryCount: 1,
    });
    expect(result.result.verdict).toBe("retry");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("returns retry when tactical depth is <= 2 even if other scores pass", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 4,
          information_density: 4,
          japanese_quality: 4,
          tactical_depth: 2,
        },
        issues: ["generic"],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: "body",
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("retry");
  });

  it("returns reject when retry count is already 2", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 2,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: ["x"],
        verdict: "retry",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      matchContext,
      narrative: "body",
      retryCount: 2,
    });
    expect(result.result.verdict).toBe("reject");
    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonMode: true,
      }),
    );
  });

  it("passes match context into the QA prompt", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 3,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: [],
        verdict: "publish",
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await evaluateNarrativeQuality({
      contentType: "recap",
      matchContext,
      narrative: "body",
      retryCount: 0,
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Ireland 24 — France 17"),
      }),
    );
  });
});
