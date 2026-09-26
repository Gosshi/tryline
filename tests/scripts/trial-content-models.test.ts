import { describe, expect, it, vi } from "vitest";

import {
  getRecentAverageArticleCost,
  parseTrialArgs,
  runTrialBatch,
} from "@/scripts/trial-content-models";

import type { PipelineResult, PipelineTrialDetails } from "@/lib/llm/pipeline";

const trialDetails: PipelineTrialDetails = {
  content: "# article\ncontent",
  promptVariant: "A",
  promptVersion: "recap@4.20.0",
  promptSha256: "prompt-hash",
  prompt: "joined prompt",
  inputSha256: "input-hash",
  stageMetrics: [
    {
      name: "generate-narrative",
      stage: 3,
      modelVersion: "gpt-6-sol-2026-09-22",
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.003,
      durationMs: 1500,
    },
  ],
  lengthRevisionAttempts: 0,
  retries: 0,
  comparisonQa: {
    issues: [],
    scores: {
      factual_grounding: 4,
      information_density: 4,
      japanese_quality: 4,
      tactical_depth: 4,
    },
    verdict: "publish",
  },
  comparisonQaCostUsd: 0.0005,
  qa: {
    issues: [],
    scores: {
      factual_grounding: 4,
      information_density: 4,
      japanese_quality: 4,
      tactical_depth: 4,
    },
    verdict: "publish",
  },
  entityGate: { passed: true, ungroundedSurfaces: [] },
  costUsd: 0.003,
  durationMs: 2000,
};

function result(): PipelineResult {
  return {
    matchId: "match-1",
    contentType: "recap",
    status: "published",
    qa: trialDetails.qa,
    trial: trialDetails,
  };
}

describe("trial-content-models", () => {
  it("parses paired configs and dry-run cost options", () => {
    expect(
      parseTrialArgs([
        "--matches",
        "match-1,match-2",
        "--content-type",
        "recap",
        "--config",
        "current",
        "--config",
        "gpt6",
        "--max-usd",
        "2",
        "--dry-run",
        "--average-cost-usd",
        "0.14",
      ]),
    ).toMatchObject({
      matches: ["match-1", "match-2"],
      contentType: "recap",
      configs: ["current", "gpt6"],
      maxUsd: 2,
      dryRun: true,
      averageCostOverride: 0.14,
    });
  });

  it("does not call generation or write artifacts in dry-run", async () => {
    const args = parseTrialArgs([
      "--matches",
      "match-1,match-2,match-3",
      "--content-type",
      "recap",
      "--dry-run",
    ]);
    const generate = vi.fn();
    const write = vi.fn();

    const result = await runTrialBatch(args, 0.14, { generate, write });

    expect(result.estimateUsd).toBeCloseTo(1.68);
    expect(generate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(result.summary).toContain("Estimated maximum cost (including retry allowance): $1.68");
  });

  it("blocks over-budget work before calling the generator", async () => {
    const args = parseTrialArgs([
      "--matches",
      "match-1,match-2,match-3",
      "--content-type",
      "recap",
      "--max-usd",
      "1",
    ]);
    const generate = vi.fn();

    await expect(
      runTrialBatch(args, 0.14, { generate, write: vi.fn() }),
    ).rejects.toThrow("no LLM calls were made");
    expect(generate).not.toHaveBeenCalled();
  });

  it("continues to the other config after one config fails", async () => {
    const args = parseTrialArgs([
      "--matches",
      "match-1",
      "--content-type",
      "recap",
      "--config",
      "current",
      "--config",
      "gpt6",
    ]);
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("current failed"))
      .mockResolvedValueOnce(result());
    const written: Array<[string, string]> = [];

    const run = await runTrialBatch(args, 0.14, {
      generate,
      write: async (path, contents) => {
        written.push([path, contents]);
      },
    });

    expect(generate.mock.calls.map((call) => call[2])).toEqual([
      "current",
      "gpt6",
    ]);
    expect(run.rows).toHaveLength(2);
    expect(run.rows[0]?.error).toBe("current failed");
    expect(run.rows[1]?.result?.trial?.content).toBe("# article\ncontent");
    expect(written.map(([path]) => path)).toEqual([
      "summary.md",
      "match-1-gpt6.md",
    ]);
    expect(run.summary).toContain("current failed");
  });

  it("averages recent costs by pipeline run for the selected content type", async () => {
    const records = [
      { content_type: "recap", match_id: "a", stage: 5, created_at: "2026-08-31T23:59:59Z", cost_usd: 8 },
      { content_type: "recap", match_id: "a", stage: 1, created_at: "2026-09-01T00:00:00Z", cost_usd: 0 },
      { content_type: "recap", match_id: "a", stage: 2, created_at: "2026-09-01T00:00:01Z", cost_usd: 0.1 },
      { content_type: "recap", match_id: "a", stage: 3, created_at: "2026-09-01T00:00:02Z", cost_usd: 0.1 },
      { content_type: "recap", match_id: "b", stage: 1, created_at: "2026-09-02T00:00:00Z", cost_usd: 0 },
      { content_type: "recap", match_id: "b", stage: 2, created_at: "2026-09-02T00:00:01Z", cost_usd: 0.2 },
      { content_type: "preview", match_id: "c", stage: 1, created_at: "2026-09-02T00:00:00Z", cost_usd: 0 },
      { content_type: "preview", match_id: "c", stage: 2, created_at: "2026-09-02T00:00:01Z", cost_usd: 0.4 },
    ];
    const builder = {
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: records, error: null }),
      select: vi.fn().mockReturnThis(),
    };
    const db = { from: vi.fn().mockReturnValue(builder) };

    await expect(
      getRecentAverageArticleCost(
        db as never,
        "recap",
        new Date("2026-09-24T00:00:00Z"),
      ),
    ).resolves.toBeCloseTo(0.2);
    expect(builder.gte).toHaveBeenCalledWith("created_at", "2026-08-25T00:00:00.000Z");
    expect(db.from).toHaveBeenCalledWith("pipeline_runs");
  });
});
