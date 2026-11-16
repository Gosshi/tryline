import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTextResponse: vi.fn(),
  assemble: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
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
vi.mock("node:fs/promises", () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
  readFile: mocks.readFile,
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

import { buildUsableContentInput } from "@/lib/llm/lineups";
import { MODELS } from "@/lib/llm/models";
import * as pipeline from "@/lib/llm/pipeline";
import {
  main,
  parseComparisonArgs,
  stripTrialHeader,
} from "@/scripts/compare-qa-models";

import { makeAssembled, tacticalPoints } from "../fixtures/content-prompt-ab";

import type { AssembledContentInputWithEventIntegrity } from "@/lib/llm/stages/assemble";
import type { QaResult, ScoreTimeline } from "@/lib/llm/types";

const narrative = "# ターニングポイント\n" + "あ".repeat(2200);
const baseScores: QaResult["scores"] = {
  information_density: 4,
  japanese_quality: 4,
  factual_grounding: 4,
  tactical_depth: 4,
};
const baseline = "gpt-5.6-luna";
const candidate = "gpt-6-luna";
type Request = { model: string; input: string; jsonMode?: boolean };
type ContentRow = {
  id: string;
  match_id: string;
  content_md: string;
  status: string;
  language: string;
  content_type: string;
  generated_at: string;
};
let records: ContentRow[];
let retired: Set<string>;
let grades: (request: Request) => {
  scores: QaResult["scores"];
  issues: string[];
};
const queries: {
  table: string;
  selected?: string;
  filters: [string, string][];
  cutoff?: string;
  order?: unknown;
  limit?: number;
}[] = [];
const calls: { stage: string; model: string }[] = [];
const timeline: ScoreTimeline = {
  final_home: 24,
  final_away: 17,
  ht_home: 12,
  ht_away: 10,
  score_progression: [
    {
      minute: 65,
      home: 24,
      away: 17,
      team: "home",
      type: "try",
      player: "選手A",
    },
  ],
  lead_changes: [],
  winning_score: null,
};
function record(id: string, status = "published"): ContentRow {
  return {
    id: `row-${id}`,
    match_id: id,
    content_md: narrative + `\narticle-${id}`,
    status,
    language: "ja",
    content_type: "recap",
    generated_at: new Date().toISOString(),
  };
}
function args(...extra: string[]) {
  return ["--content-type", "recap", ...extra];
}
function summary(): string {
  return mocks.writeFile.mock.calls.find(([path]) =>
    String(path).endsWith("/summary.md"),
  )?.[1] as string;
}
function artifacts() {
  return mocks.writeFile.mock.calls.filter(
    ([path]) => !String(path).endsWith("/summary.md"),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  records = [record("one")];
  retired = new Set();
  queries.length = 0;
  calls.length = 0;
  grades = () => ({ scores: baseScores, issues: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network in offline QA comparison test");
    }),
  );
  mocks.readFile.mockResolvedValue(narrative);
  mocks.assemble.mockResolvedValue(makeAssembled({ score_timeline: timeline }));
  mocks.from.mockImplementation((table: string) => {
    if (!["matches", "match_content"].includes(table))
      throw new Error(`Unexpected DB access: ${table}`);
    const details: (typeof queries)[number] = { table, filters: [] };
    queries.push(details);
    const query = {
      select: (selected: string) => {
        details.selected = selected;
        return query;
      },
      eq: (key: string, value: string) => {
        details.filters.push([key, value]);
        return query;
      },
      gte: (_key: string, value: string) => {
        details.cutoff = value;
        return query;
      },
      order: (key: string, options: unknown) => {
        details.order = [key, options];
        return query;
      },
      limit: async (limit: number) => {
        details.limit = limit;
        return {
          data: records
            .filter(
              (row) =>
                details.filters.every(
                  ([key, value]) => row[key as keyof ContentRow] === value,
                ) && row.generated_at >= details.cutoff!,
            )
            .sort((a, b) => b.generated_at.localeCompare(a.generated_at))
            .slice(0, limit),
          error: null,
        };
      },
      single: async () => ({
        data: {
          competition: {
            family: retired.has(
              details.filters.find(([key]) => key === "id")?.[1] ?? "",
            )
              ? "top-14"
              : "urc",
          },
        },
        error: null,
      }),
      maybeSingle: async () => ({ data: null, error: null }),
      insert: mocks.insert,
      update: mocks.update,
      upsert: mocks.upsert,
      delete: mocks.delete,
    };
    return query;
  });
  mocks.createTextResponse.mockImplementation(async (request: Request) => {
    let stage: string;
    let data: unknown;
    if (!request.jsonMode) {
      stage = "narrative";
      data = narrative;
    } else if (request.input.includes('"tactical_points"')) {
      stage = "extract";
      data = { tactical_points: [tacticalPoints[0], tacticalPoints[0]] };
    } else if (request.input.includes('"mentions"')) {
      stage = "entities";
      data = { mentions: [] };
    } else if (request.input.includes('"scores"')) {
      stage = "qa";
      data = { ...grades(request), verdict: "publish" };
    } else throw new Error("Unexpected prompt");
    calls.push({ stage, model: request.model });
    return {
      text: typeof data === "string" ? data : JSON.stringify(data),
      model: request.model,
      usage: { inputTokens: 1000, outputTokens: 100 },
    };
  });
});
afterEach(() => {
  for (const spy of [
    mocks.insert,
    mocks.update,
    mocks.upsert,
    mocks.delete,
    mocks.notify,
    mocks.indexNow,
    mocks.revalidate,
  ])
    expect(spy).not.toHaveBeenCalled();
  expect(
    mocks.from.mock.calls.some(([table]) => table === "pipeline_runs"),
  ).toBe(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QA comparison through the real quality gate (offline)", () => {
  it("grades each article once with both models for QA and entities, sharing one assembled input", async () => {
    records.push(record("two", "draft"));
    const gate = vi.spyOn(pipeline, "runQualityGateForNarrative");
    await main(args());
    expect(calls).toEqual(
      ["one", "two"].flatMap(() => [
        { stage: "entities", model: baseline },
        { stage: "qa", model: baseline },
        { stage: "entities", model: candidate },
        { stage: "qa", model: candidate },
      ]),
    );
    expect(mocks.assemble.mock.calls).toEqual([
      ["one", "ja", "recap"],
      ["two", "ja", "recap"],
    ]);
    expect(gate).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i += 2) {
      expect(gate.mock.calls[i]![0].usable).toBe(
        gate.mock.calls[i + 1]![0].usable,
      );
      expect(gate.mock.calls[i]![0]).toMatchObject({
        retryCount: 0,
        verifyEntities: true,
        contentType: "recap",
        language: "ja",
      });
    }
    expect(summary()).toContain("Actual cost (returned usage): $0.001880");
  });

  it("selects recent Japanese rows by status, content type and generated_at before each limit", async () => {
    records.push(
      record("draft", "draft"),
      { ...record("english"), language: "en" },
      { ...record("preview"), content_type: "preview" },
      { ...record("old"), generated_at: "2020-01-01T00:00:00Z" },
    );
    await main(args("--published", "1", "--draft", "2", "--since-days", "7"));
    const selections = queries.filter((q) => q.table === "match_content");
    expect(selections).toHaveLength(2);
    expect(selections[0]).toMatchObject({
      filters: [
        ["language", "ja"],
        ["content_type", "recap"],
        ["status", "published"],
      ],
      order: ["generated_at", { ascending: false }],
      limit: 1,
    });
    expect(selections[1]).toMatchObject({
      filters: [
        ["language", "ja"],
        ["content_type", "recap"],
        ["status", "draft"],
      ],
      limit: 2,
    });
    expect(Date.now() - new Date(selections[0]!.cutoff!).getTime()).toBeCloseTo(
      7 * 86_400_000,
      -3,
    );
    expect(summary()).toContain("Articles: 2");
  });

  it.each([baseline, candidate])(
    "continues the other side and later articles when %s fails",
    async (failedModel) => {
      records.push(record("two"));
      grades = (request) => {
        if (
          request.model === failedModel &&
          request.input.includes("article-one")
        )
          throw new Error("mock scoring failure");
        return { scores: baseScores, issues: [] };
      };
      await main(args());
      expect(summary()).toContain("error: mock scoring failure");
      expect(summary()).toContain("two / row-two");
      expect(calls.filter((call) => call.stage === "qa")).toHaveLength(3);
      expect(mocks.assemble).toHaveBeenCalledTimes(2);
      expect(summary()).toContain("| publish | 1 | 0 |");
    },
  );

  it("strips the real trial Markdown header and preserves the exact article for both scorers", async () => {
    const markdown = readFileSync(
      "tests/fixtures/qa-comparison/trial.md",
      "utf8",
    );
    mocks.readFile.mockResolvedValue(markdown);
    const gate = vi.spyOn(pipeline, "runQualityGateForNarrative");
    await main(
      args("--published", "0", "--draft", "0", "--file", "file-match:trial.md"),
    );
    expect(mocks.readFile).toHaveBeenCalledWith("trial.md", "utf8");
    for (const [input] of gate.mock.calls) {
      expect(input.narrative).toBe(
        markdown.slice(markdown.indexOf("# この試合の核心")),
      );
      expect(input.narrative).not.toContain("Retries:");
    }
    expect(summary()).toContain("file-match / file");
    expect(summary()).toContain("| file |");
  });

  it("keeps repeated --file articles for the same match in distinct artifact files", async () => {
    grades = (request) => ({
      scores: {
        ...baseScores,
        factual_grounding: request.model === candidate ? 2 : 4,
      },
      issues: [],
    });
    await main(
      args(
        "--published",
        "0",
        "--draft",
        "0",
        "--file",
        "same:first.md",
        "--file",
        "same:second.md",
      ),
    );
    expect(artifacts().map(([path]) => String(path).split("/").pop())).toEqual([
      "same-file.md",
      "same-file-2.md",
    ]);
  });

  it("blocks work over the budget before assembly or any LLM call", async () => {
    await expect(main(args("--max-usd", "0.01"))).rejects.toThrow(
      "Estimated cost $0.0160 exceeds --max-usd $0.0100",
    );
    expect(mocks.assemble).not.toHaveBeenCalled();
    expect(mocks.createTextResponse).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.mkdir).not.toHaveBeenCalled();
  });

  it("runs dry-run with files entirely offline, printing target list and estimate only", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await main(
      args(
        "--dry-run",
        "--published",
        "0",
        "--draft",
        "0",
        "--file",
        "offline:article.md",
      ),
    );
    expect(log).toHaveBeenCalledWith(
      "Estimated LLM cost: $0.0160 (1 articles × 2 models × $0.0040 × 2 retry allowance)",
    );
    expect(log).toHaveBeenCalledWith("offline / file (file)");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.assemble).not.toHaveBeenCalled();
    expect(mocks.createTextResponse).not.toHaveBeenCalled();
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("writes the 2x2 and disagreement table, and details for disagreements OR grounding gaps of at least two", async () => {
    records = [
      record("disagree"),
      record("gap"),
      record("agree"),
      record("bothreject"),
    ];
    grades = (request) => {
      const grounding = request.input.includes("article-gap")
        ? request.model === candidate
          ? 5
          : 3
        : request.input.includes("article-bothreject")
          ? 2
          : request.input.includes("article-disagree") &&
              request.model === candidate
            ? 2
            : 4;
      return {
        scores: { ...baseScores, factual_grounding: grounding },
        issues: [
          `${request.model} issue one`,
          `${request.model} issue two: full text`,
        ],
      };
    };
    await main(args());
    const output = summary();
    expect(output).toContain("| publish | 2 | 1 |");
    expect(output).toContain("| reject | 0 | 1 |");
    expect(output.indexOf("## Disagreements")).toBeLessThan(
      output.indexOf("## Agreements"),
    );
    expect(output.split("## Agreements")[0]).toContain(
      "disagree / row-disagree",
    );
    expect(output).toContain("ハーレクインズ 対 バース");
    expect(output).toContain("publish (4/4/4/4) | retry (4/4/2/4) | -2");
    expect(artifacts().map(([path]) => String(path).split("/").pop())).toEqual([
      "disagree-row-disagree.md",
      "gap-row-gap.md",
    ]);
    for (const [, content] of artifacts()) {
      expect(content).toContain("Final score: 24 - 17");
      expect(content).toContain('"minute": 65');
      expect(content).toContain(narrative);
      expect(content).toContain("### Deterministic guard issues");
      expect(content).toContain("### Ungrounded surfaces");
      for (const model of [baseline, candidate])
        for (const issue of ["issue one", "issue two: full text"])
          expect(content).toContain(`${model} ${issue}`);
    }
    console.log("Mock summary example:\n" + output);
  });

  it("includes deterministic guard issues and ungrounded surfaces in the details", async () => {
    const original = mocks.createTextResponse.getMockImplementation()!;
    mocks.createTextResponse.mockImplementation(async (request: Request) => {
      if (request.model === candidate && request.input.includes('"mentions"'))
        return {
          text: JSON.stringify({
            mentions: [{ surface: "架空選手", matched_entity: null }],
          }),
          model: candidate,
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      return original(request);
    });
    await main(args());
    expect(artifacts()).toHaveLength(1);
    expect(artifacts()[0]![1]).toContain("架空選手");
    expect(artifacts()[0]![1]).toContain("入力データに存在しない人名を含む");
  });
});

describe("read-only quality gate input and unchanged generation model routing", () => {
  it("skips retired competitions before assembling", async () => {
    retired.add("one");
    await main(args());
    expect(mocks.assemble).not.toHaveBeenCalled();
    expect(mocks.createTextResponse).not.toHaveBeenCalled();
    expect(summary()).toContain("Skipped: 1");
    expect(summary()).toContain("one / row-one: competition_retired");
  });
  const mismatch: AssembledContentInputWithEventIntegrity["eventIntegrity"] = {
    status: "mismatch",
    reason: "score_mismatch",
    expected: { home: 24, away: 17 },
    actual: { home: 5, away: 0 },
    delta: { home: -19, away: -17 },
    eventCount: 1,
  };
  const unavailable: AssembledContentInputWithEventIntegrity["eventIntegrity"] =
    {
      status: "unavailable",
      reason: "events_unavailable",
      expected: { home: 24, away: 17 },
      actual: null,
      delta: null,
      eventCount: 0,
    };
  it.each([
    [mismatch, "score_mismatch"],
    [unavailable, "events_unavailable"],
  ] as const)(
    "skips recap integrity failures: %s",
    async (eventIntegrity, reason) => {
      mocks.assemble.mockResolvedValue({ ...makeAssembled(), eventIntegrity });
      await main(args());
      expect(mocks.createTextResponse).not.toHaveBeenCalled();
      expect(summary()).toContain(reason);
      expect(mocks.assemble).toHaveBeenCalledTimes(1);
    },
  );
  it("does not apply recap-only integrity skips to preview", async () => {
    const assembled = { ...makeAssembled(), eventIntegrity: mismatch };
    mocks.assemble.mockResolvedValue(assembled);
    expect(
      await pipeline.loadQualityGateInput("preview", "preview", "ja"),
    ).toEqual({ usable: buildUsableContentInput(assembled) });
  });
  it.each([undefined, "gpt-6-luna"])(
    "preserves generateMatchContent QA/entity models with fast=%s and QA-only comparison",
    async (fast) => {
      await pipeline.generateMatchContent("one", "recap", "ja", {
        persist: false,
        models: fast ? { fast } : undefined,
        comparisonQaModel: "gpt-6-sol",
      });
      expect(calls).toEqual([
        { stage: "extract", model: fast ?? MODELS.FAST },
        { stage: "narrative", model: MODELS.NARRATIVE },
        { stage: "entities", model: fast ?? MODELS.FAST },
        { stage: "qa", model: fast ?? MODELS.FAST },
        { stage: "qa", model: "gpt-6-sol" },
      ]);
    },
  );
  it("uses passed entity feedback when entity verification is disabled", async () => {
    const result = await pipeline.runQualityGateForNarrative({
      usable: buildUsableContentInput(makeAssembled()),
      contentType: "recap",
      language: "ja",
      narrative,
      retryCount: 0,
      verifyEntities: false,
      entityViolationFeedback: ["架空選手"],
    });
    expect(result.entityVerification).toBeNull();
    expect(result.qaResponse.result.verdict).toBe("retry");
    expect(calls).toEqual([{ stage: "qa", model: MODELS.FAST }]);
  });
});

describe("comparison CLI validation", () => {
  it.each([
    ["--content-type", "other"],
    ["--content-type", "recap", "--published", "-1"],
    ["--content-type", "recap", "--draft", "1.2"],
    ["--content-type", "recap", "--max-usd", "NaN"],
    ["--content-type", "recap", "--file", "missing-colon"],
    ["--unknown", "value"],
  ])("rejects invalid arguments: %s", (...input) => {
    expect(() => parseComparisonArgs(input)).toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("keeps ordinary Markdown intact, handles CRLF trials, and rejects missing article body", () => {
    const ordinary = "# 普通の記事\n\n本文\nRetries: is not a header";
    expect(stripTrialHeader(ordinary)).toBe(ordinary);
    expect(
      stripTrialHeader("# id — fast6\r\n\r\nRetries: 1\r\n\r\n# 本文\r\ntext"),
    ).toBe("# 本文\r\ntext");
    expect(() =>
      stripTrialHeader("# id — fast6\nRetries: 1\nno article heading"),
    ).toThrow("no article heading");
  });
});
