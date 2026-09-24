import { describe, expect, it, vi } from "vitest";

import {
  freezePromptFixtures,
  parsePromptExperimentArgs,
  runPromptExperiment,
} from "@/scripts/ab-content-prompts";

import type { PipelineResult } from "@/lib/llm/pipeline";
import type { AssembledContentInputWithEventIntegrity } from "@/lib/llm/stages/assemble";

const integrity = {
  actual: { away: 17, home: 24 },
  delta: { away: 0, home: 0 },
  eventCount: 1,
  expected: { away: 17, home: 24 },
  reason: "verified" as const,
  status: "verified" as const,
};

function assembled(overrides: Partial<AssembledContentInputWithEventIntegrity> = {}): AssembledContentInputWithEventIntegrity {
  return {
    match: {
      id: "match-1",
      kickoff_at: "2026-01-01T00:00:00.000Z",
      kickoff_at_jst: "2026-01-01 09:00 JST",
      status: "finished",
      venue: null,
      home_score: 24,
      away_score: 17,
      competition: null,
      home_team: null,
      away_team: null,
    },
    match_phase: null,
    recent_form: { home: [], away: [] },
    h2h_last_5: [],
    match_events: [{ type: "try", minute: 10, team_name: "Home", player_name: "Player" }],
    competition_standings: [],
    projected_lineups: { home: [], away: [] },
    injuries: { home: [], away: [] },
    key_stats: {
      home: { avg_points_for_last_5: null, avg_points_against_last_5: null, win_rate_last_5: null, avg_score_diff_last_5: null, result_streak: null },
      away: { avg_points_for_last_5: null, avg_points_against_last_5: null, win_rate_last_5: null, avg_score_diff_last_5: null, result_streak: null },
      match: { penalty_count: { home: 0, away: 0 }, try_count: { home: 1, away: 0 }, late_scoring: false },
    },
    score_timeline: null,
    derived_stats: null,
    team_stats: null,
    sourced_facts: [],
    eventIntegrity: integrity,
    ...overrides,
  };
}

const points = [{ tactical_dimension: "set piece", home_situation: "H", away_situation: "A", matchup_implication: "I", match_impact: "low" as const }];

function pipelineResult(variant: "A" | "B", content = `# ${variant} draft`) : PipelineResult {
  return {
    matchId: "match-1",
    contentType: "recap",
    status: "draft",
    qa: null,
    trial: {
      content,
      promptVariant: variant,
      promptVersion: variant === "A" ? "recap@4.20.0" : "recap-b@0.1.0",
      promptSha256: `${variant}-hash`,
      prompt: `${variant} joined prompt`,
      inputSha256: "input-hash",
      stageMetrics: [],
      lengthRevisionAttempts: 0,
      retries: 0,
      comparisonQa: null,
      comparisonQaCostUsd: 0,
      qa: { issues: [], scores: { factual_grounding: 4, information_density: 4, japanese_quality: 4, tactical_depth: 4 }, verdict: "publish" },
      entityGate: { passed: true, ungroundedSurfaces: [] },
      costUsd: 0.04,
      durationMs: 100,
    },
  };
}

describe("ab-content-prompts", () => {
  it("parses the freeze and run commands", () => {
    expect(parsePromptExperimentArgs(["freeze", "--matches", "a,b", "--content-type", "preview"]).matches).toEqual(["a", "b"]);
    expect(parsePromptExperimentArgs(["run", "--fixtures", "a.json", "--dry-run", "--reveal"]).reveal).toBe(true);
  });

  it("rejects post-match previews and invalid recaps without writing", async () => {
    const write = vi.fn();
    const extract = vi.fn(async () => ({ result: { tactical_points: points }, promptVersion: "extract@x", modelVersion: "fast", usage: { inputTokens: 1, outputTokens: 1 }, attempts: 1 }));
    const result = await freezePromptFixtures(
      { matches: ["preview-status", "preview-score"], contentType: "preview", force: false },
      { assemble: async (id) => assembled({ match: { ...assembled().match, status: id === "preview-status" ? "finished" : "scheduled", home_score: id === "preview-status" ? null : 24, away_score: id === "preview-status" ? null : 17 } }), extract, write: write as never, now: () => new Date("2026-01-01T00:00:00Z"), gitSha: () => "sha" },
    );
    expect(result.every((row) => row.error)).toBe(true);
    expect(extract).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();

    const recapResult = await freezePromptFixtures(
      { matches: ["recap-events", "recap-mismatch"], contentType: "recap", force: false },
      { assemble: async (id) => id === "recap-events" ? assembled({ match_events: [] }) : assembled({ eventIntegrity: { ...integrity, status: "mismatch", reason: "score_mismatch" } }), extract, write: write as never, now: () => new Date("2026-01-01T00:00:00Z"), gitSha: () => "sha" },
    );
    expect(recapResult.every((row) => row.error?.includes("requires match events"))).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it("writes a frozen fixture with a stable input hash and extraction metadata", async () => {
    const writes: string[] = [];
    const write = vi.fn(async (path: string, _contents: string) => { writes.push(path); });
    const result = await freezePromptFixtures(
      { matches: ["match-1"], contentType: "recap", force: false },
      { assemble: async () => assembled(), extract: vi.fn(async () => ({ result: { tactical_points: points }, promptVersion: "extract@2.3.0", modelVersion: "gpt-5.6-luna", usage: { inputTokens: 1, outputTokens: 1 }, attempts: 1 })), write: write as never, now: () => new Date("2026-01-01T00:00:00Z"), gitSha: () => "sha" },
    );
    expect(result[0]?.path).toContain("match-1-recap.json");
    expect(writes).toHaveLength(1);
    expect(write.mock.calls[0]?.[1]).toContain('"promptVersion": "extract@2.3.0"');
  });

  it("runs paired variants, writes blind artifacts and matching keys", async () => {
    const writes = new Map<string, string>();
    const read = vi.fn(async () => JSON.stringify({ assembled: assembled(), tacticalPoints: points, inputSha256: "input-hash", gitSha: "sha", extraction: { modelVersion: "extract-model", promptVersion: "extract@2", costUsd: 0 }, frozenAt: "now" }));
    const generate = vi.fn(async (_id: string, _type: "preview" | "recap", variant: "A" | "B") => pipelineResult(variant));
    const result = await runPromptExperiment(
      { fixtures: ["match-1-recap.json"], maxUsd: 1, dryRun: false, reveal: false },
      { generate, averageCost: async () => 0.1, read, write: async (path, value) => { writes.set(path, String(value)); return undefined; }, mkdir: async () => undefined, now: () => new Date("2026-01-01T00:00:00Z"), seed: 12, outputRoot: "/tmp/prompt-ab-test" },
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.ledger).toHaveLength(2);
    expect(writes.get(`${result.outputDirectory}/blind/match-1-X.md`)).toMatch(/^# [AB] draft$/);
    expect(writes.get(`${result.outputDirectory}/blind/match-1-X.md`)).not.toContain("recap-b@0.1.0");
    expect(writes.get(`${result.outputDirectory}/blind/match-1-X.md`)).not.toContain("factual_grounding");
    const key = JSON.parse(writes.get(`${result.outputDirectory}/blind-key.json`) ?? "{}") as Record<string, { X: "A" | "B"; Y: "A" | "B" }>;
    expect(key["match-1"]?.X).toBeDefined();
    expect(key["match-1"]?.Y).not.toBe(key["match-1"]?.X);
    expect(JSON.parse(writes.get(`${result.outputDirectory}/ledger.json`) ?? "[]")).toHaveLength(2);
  });

  it("does not invoke generation when estimate exceeds the budget, including dry run", async () => {
    const generate = vi.fn(async () => pipelineResult("A"));
    const dependencies = { generate, averageCost: async () => 0.75, read: async () => JSON.stringify({ assembled: assembled(), tacticalPoints: points, inputSha256: "h", extraction: {}, gitSha: "sha" }), write: vi.fn(async () => undefined), mkdir: vi.fn(async () => undefined), now: () => new Date(), seed: 1, outputRoot: "/tmp/prompt-ab-test" };
    await runPromptExperiment({ fixtures: ["match-1-recap.json"], maxUsd: 1, dryRun: false, reveal: false }, dependencies);
    expect(generate).not.toHaveBeenCalled();
    const dryRun = await runPromptExperiment({ fixtures: ["match-1-recap.json"], maxUsd: 1, dryRun: true, reveal: false }, dependencies);
    expect(generate).not.toHaveBeenCalled();
    expect(dryRun.output).toContain("No LLM calls");
    expect(dryRun.output).toBe("[dry-run] 1 fixtures × 2 variants; estimate $1.5000. No LLM calls or artifacts created.");
    expect(dependencies.write).not.toHaveBeenCalled();
  });
});
