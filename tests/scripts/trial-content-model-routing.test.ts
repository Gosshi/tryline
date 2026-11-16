import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
  assemble: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  from: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  notify: vi.fn(),
  indexNow: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/llm/openai", () => ({
  createTextResponse: mocks.createTextResponse,
}));
vi.mock("@/lib/llm/stages/assemble", () => ({
  assembleMatchContentInput: mocks.assemble,
  computeScoreTimeline: () => null,
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
vi.mock("node:fs/promises", async (original) => ({
  ...(await original<typeof import("node:fs/promises")>()),
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));
vi.mock("@/lib/llm/notify", () => ({
  notifyContentQualityRegression: mocks.notify,
  notifyContentRejected: mocks.notify,
  notifyCostAlert: mocks.notify,
  notifyEventIntegrityMismatch: mocks.notify,
}));
vi.mock("@/lib/seo/indexnow", () => ({ submitUrlsToIndexNow: mocks.indexNow }));
vi.mock("@/lib/cache/public-data", () => ({
  PUBLIC_DATA_CACHE_TAGS: { content: "test-content", matches: "test-matches" },
  revalidatePublicData: mocks.revalidate,
}));

import { MODELS } from "@/lib/llm/models";
import { main } from "@/scripts/trial-content-models";

import { makeAssembled, tacticalPoints } from "../fixtures/content-prompt-ab";

const scores = {
  information_density: 4,
  japanese_quality: 4,
  factual_grounding: 4,
  tactical_depth: 4,
};
type Request = { model: string; input: string; jsonMode?: boolean };
const calls: { stage: string; model: string }[] = [];

function args(...configs: string[]) {
  return [
    "--matches",
    "trial-match",
    "--content-type",
    "recap",
    ...configs.flatMap((config) => ["--config", config]),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected real network call in mocked model trial");
    }),
  );
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.writeFile.mockResolvedValue(undefined);
  const now = new Date().toISOString();
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      gte: () => query,
      order: () => query,
      single: async () => ({
        data: { competition: { family: "urc" } },
        error: null,
      }),
      maybeSingle: async () => ({ data: null, error: null }),
      range: async () => ({
        data: [
          {
            match_id: "cost-baseline",
            content_type: "recap",
            stage: 1,
            created_at: now,
            cost_usd: 0,
          },
          {
            match_id: "cost-baseline",
            content_type: "recap",
            stage: 3,
            created_at: now,
            cost_usd: 0.14,
          },
        ],
        error: null,
      }),
      insert: mocks.insert,
      update: mocks.update,
      upsert: mocks.upsert,
    };
    if (!["matches", "match_content", "pipeline_runs"].includes(table))
      throw new Error(`Unexpected table ${table}`);
    return query;
  });
  mocks.assemble.mockResolvedValue({
    ...makeAssembled(),
    eventIntegrity: {
      actual: { home: 24, away: 17 },
      expected: { home: 24, away: 17 },
      delta: { home: 0, away: 0 },
      eventCount: 1,
      reason: "verified",
      status: "verified",
    },
  });
  mocks.createTextResponse.mockImplementation(async (request: Request) => {
    let stage: string;
    let text: string;
    if (!request.jsonMode) {
      stage = "narrative";
      text = `# ターニングポイント\n${"あ".repeat(2200)}`;
    } else if (request.input.includes('"tactical_points"')) {
      stage = "extract";
      text = JSON.stringify({
        tactical_points: [tacticalPoints[0], tacticalPoints[0]],
      });
    } else if (request.input.includes('"mentions"')) {
      stage = "entities";
      text = JSON.stringify({ mentions: [] });
    } else if (request.input.includes('"scores"')) {
      stage = "qa";
      text = JSON.stringify({ scores, issues: [], verdict: "publish" });
    } else throw new Error("Unexpected LLM prompt in fixture");
    calls.push({ stage, model: request.model });
    return {
      text,
      model: request.model,
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stage A trial model routing through the real pipeline and stages", () => {
  it.each([
    ["fast6", MODELS.NARRATIVE, "gpt-6-luna", true],
    ["sol", "gpt-6-sol", MODELS.FAST, false],
    ["gpt6", "gpt-6-sol", "gpt-6-luna", true],
  ] as const)(
    "routes current + %s to createTextResponse without DB writes",
    async (config, narrative, fast, comparison) => {
      await main(args("current", config));
      expect(calls).toEqual([
        { stage: "extract", model: MODELS.FAST },
        { stage: "narrative", model: MODELS.NARRATIVE },
        { stage: "entities", model: MODELS.FAST },
        { stage: "qa", model: MODELS.FAST },
        { stage: "extract", model: fast },
        { stage: "narrative", model: narrative },
        { stage: "entities", model: fast },
        { stage: "qa", model: fast },
        ...(comparison ? [{ stage: "qa", model: MODELS.FAST }] : []),
      ]);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.indexNow).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
      expect(mocks.assemble).toHaveBeenCalledTimes(2);
      const summary = mocks.writeFile.mock.calls.find((call) =>
        String(call[0]).endsWith("summary.md"),
      )?.[1] as string;
      expect(summary).toContain(`| trial-match | ${config} | published |`);
      expect(summary).toContain(`| ${config} | 1 |`);
      const averages = summary.split("## Stage averages")[1]!;
      for (const stage of [
        "extract-facts",
        "generate-narrative",
        "qa",
        "verify-entities",
      ])
        expect(averages).toContain(`| ${config} | ${stage} |`);
      expect(averages.includes(`| ${config} | comparison-qa |`)).toBe(
        comparison,
      );
    },
  );

  it("rejects fast6 without current before the generator or database is called", async () => {
    await expect(main(args("fast6"))).rejects.toThrow("current");
    expect(mocks.createTextResponse).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("runs the four-match three-config dry-run entirely offline", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await main([
      "--dry-run",
      "--matches",
      "trial-a,trial-b,trial-c,trial-d",
      "--content-type",
      "recap",
      "--config",
      "current",
      "--config",
      "fast6",
      "--config",
      "sol",
      "--max-usd",
      "4",
      "--average-cost-usd",
      "0.14",
    ]);
    expect(log).toHaveBeenCalledWith(
      "Estimated LLM cost: $3.36 (4 matches × 3 configs × $0.1400 × 2 retry allowance)",
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.createTextResponse).not.toHaveBeenCalled();
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("blocks three-config work above max-usd before any LLM stage", async () => {
    await expect(
      main([
        "--matches",
        "trial-a,trial-b,trial-c,trial-d",
        "--content-type",
        "recap",
        "--config",
        "current",
        "--config",
        "fast6",
        "--config",
        "sol",
        "--max-usd",
        "3",
      ]),
    ).rejects.toThrow(
      "Estimated cost $3.36 exceeds --max-usd $3.00; no LLM calls were made",
    );
    expect(mocks.createTextResponse).not.toHaveBeenCalled();
    expect(mocks.assemble).not.toHaveBeenCalled();
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("keeps the three production article and search model defaults unchanged", () => {
    expect(MODELS.FAST).toBe("gpt-5.6-luna");
    expect(MODELS.NARRATIVE).toBe("gpt-5.6-terra");
    expect(MODELS.WEB_SEARCH).toBe("gpt-5.6-terra");
  });
});
