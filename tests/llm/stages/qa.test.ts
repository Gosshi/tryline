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
const longJaPreview = "あ".repeat(1500);
const longJaRecap = "あ".repeat(2000);

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
      narrative: longJaPreview,
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
      narrative: longJaPreview,
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
      narrative: longJaPreview,
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
      narrative: longJaPreview,
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
      narrative: longJaRecap,
      retryCount: 0,
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Ireland 24 — France 17"),
      }),
    );
  });

  it("caps information density when event recap lacks the turning point heading", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: "# 試合全体像\n本文",
      retryCount: 0,
    });

    expect(result.result.scores.information_density).toBe(2);
    expect(result.result.issues).toContain(
      "ターニングポイントセクションが欠落しています",
    );
  });

  it("forces factual grounding failure when unsupported statistics are present", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: `# ターニングポイント\nIrelandはスクラム成功率85%でFranceを押し込んだ。${"あ".repeat(
        1600,
      )}`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(1);
    expect(result.result.issues).toContain("データに存在しない統計値を含む");
    expect(result.result.verdict).not.toBe("publish");
  });

  it("caps information density for a short 1107-character recap", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      matchContext,
      narrative: "あ".repeat(1107),
      retryCount: 0,
    });

    expect(result.result.scores.information_density).toBe(2);
    expect(result.result.issues).toContain("本文が目標字数の下限未満です");
  });

  it("gates short Japanese preview content even when model scores are high", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      language: "ja",
      matchContext,
      narrative: "あ".repeat(1499),
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("retry");
    expect(result.result.scores.information_density).toBe(2);
    expect(result.result.issues).toContain("本文が目標字数の下限未満です");
  });

  it("publishes a 650-word English preview without triggering the length gate", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "preview",
      language: "en",
      matchContext,
      narrative: Array.from({ length: 650 }, () => "word").join(" "),
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("publish");
    expect(result.result.issues).not.toContain(
      "本文が目標字数の下限未満です",
    );
  });

  it("publishes a 650-word English recap without triggering the length gate", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      language: "en",
      matchContext,
      narrative: Array.from({ length: 650 }, () => "word").join(" "),
      retryCount: 0,
    });

    expect(result.result.verdict).toBe("publish");
    expect(result.result.issues).not.toContain(
      "本文が目標字数の下限未満です",
    );
  });

  it("does not penalize real score, try, and ranking numbers", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: `# ターニングポイント\nIrelandが24-17でFranceに勝ち、トライ数2、順位1位という事実に基づいて整理した。${"あ".repeat(
        2000,
      )}`,
      retryCount: 0,
    });

    expect(result.result.scores.factual_grounding).toBe(5);
    expect(result.result.scores.information_density).toBe(5);
    expect(result.result.issues).not.toContain(
      "データに存在しない統計値を含む",
    );
  });

  it("passes hasEvents into the QA prompt", async () => {
    openAIMock.createTextResponse.mockResolvedValueOnce({
      text: JSON.stringify({
        scores: {
          factual_grounding: 3,
          information_density: 3,
          japanese_quality: 3,
          tactical_depth: 3,
        },
        issues: [],
      }),
      model: "gpt-4o-mini-2024-07-18",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await evaluateNarrativeQuality({
      contentType: "recap",
      hasEvents: true,
      matchContext,
      narrative: `# ターニングポイント\n${longJaRecap}`,
      retryCount: 0,
    });

    expect(openAIMock.createTextResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("## セクション構成チェック"),
      }),
    );
  });
});
