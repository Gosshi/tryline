import { execFileSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent, type PipelineResult, type PipelineTrialDetails } from "@/lib/llm/pipeline";
import { calculateCostUsd } from "@/lib/llm/pricing";
import { PROMPT_VERSION as EXTRACT_PROMPT_VERSION } from "@/lib/llm/prompts/extract-tactical-points";
import { assembleMatchContentInput } from "@/lib/llm/stages/assemble";
import { extractTacticalPoints } from "@/lib/llm/stages/extract-facts";
import { splitRecapForPaywall } from "@/lib/match-content/markdown";
import { getRecentAverageArticleCost } from "@/scripts/trial-content-models";

import type { AssembledContentInputWithEventIntegrity } from "@/lib/llm/stages/assemble";
import type { AssembledContentInput, ContentType, TacticalPoint } from "@/lib/llm/types";

type FrozenFixture = {
  assembled: AssembledContentInputWithEventIntegrity;
  tacticalPoints: TacticalPoint[];
  inputSha256: string;
  frozenAt: string;
  gitSha: string;
  extraction: {
    promptVersion: string;
    modelVersion: string;
    costUsd: number;
  };
};

type Args = {
  command: "freeze" | "run";
  matches?: string[];
  contentType?: ContentType;
  fixtures?: string[];
  out?: string;
  force: boolean;
  maxUsd: number;
  dryRun: boolean;
  reveal: boolean;
};

type FreezeDependencies = {
  assemble: (matchId: string, language: "ja", contentType: ContentType) => Promise<AssembledContentInputWithEventIntegrity>;
  extract: typeof extractTacticalPoints;
  write: (path: string, contents: string, options: { encoding: "utf8"; flag: "w" | "wx" }) => Promise<unknown>;
  now: () => Date;
  gitSha: () => string;
};

type RunDependencies = {
  generate: (matchId: string, contentType: ContentType, variant: "A" | "B", frozenInput: { assembled: AssembledContentInput; tacticalPoints: TacticalPoint[] }) => Promise<PipelineResult>;
  averageCost: (contentType: ContentType) => Promise<number>;
  read: (path: string, encoding: "utf8") => Promise<string>;
  write: (path: string, contents: string, encoding: "utf8") => Promise<unknown>;
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  now: () => Date;
  seed: number;
  outputRoot: string;
};

const FIXTURE_ROOT = join("tmp", "prompt-ab", "fixtures");

function hashInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function parsePromptExperimentArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  if (command !== "freeze" && command !== "run") {
    throw new Error("Usage: ab-content-prompts.ts <freeze|run> [options]");
  }
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current?.startsWith("--")) throw new Error(`Unexpected argument: ${current ?? ""}`);
    if (["--force", "--dry-run", "--reveal"].includes(current)) {
      flags.add(current);
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${current}`);
    values.set(current, value);
    index += 1;
  }
  const matches = values.get("--matches")?.split(",").map((value) => value.trim()).filter(Boolean);
  const fixtures = values.get("--fixtures")?.split(",").map((value) => value.trim()).filter(Boolean);
  const contentType = values.get("--content-type");
  const maxUsd = Number(values.get("--max-usd") ?? 2);
  if (command === "freeze" && (!matches?.length || (contentType !== "preview" && contentType !== "recap"))) {
    throw new Error("freeze requires --matches <id,...> and --content-type preview|recap");
  }
  if (command === "run" && !fixtures?.length) throw new Error("run requires --fixtures <file,...>");
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error("--max-usd must be a positive number");
  return {
    command,
    ...(matches ? { matches } : {}),
    ...(contentType === "preview" || contentType === "recap" ? { contentType } : {}),
    ...(fixtures ? { fixtures } : {}),
    ...(values.get("--out") ? { out: values.get("--out") } : {}),
    force: flags.has("--force"),
    maxUsd,
    dryRun: flags.has("--dry-run"),
    reveal: flags.has("--reveal"),
  };
}

export async function freezePromptFixtures(
  args: Pick<Args, "matches" | "contentType" | "out" | "force">,
  dependencies: FreezeDependencies = {
    assemble: assembleMatchContentInput,
    extract: extractTacticalPoints,
    write: writeFile,
    now: () => new Date(),
    gitSha: () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  },
) {
  if (!args.matches?.length || !args.contentType) throw new Error("freeze arguments are incomplete");
  const outputDirectory = args.out ?? FIXTURE_ROOT;
  const results: Array<{ matchId: string; path?: string; error?: string }> = [];
  for (const matchId of args.matches) {
    try {
      const assembled = await dependencies.assemble(matchId, "ja", args.contentType);
      if (args.contentType === "preview" && (assembled.match.status !== "scheduled" || assembled.match.home_score !== null || assembled.match.away_score !== null)) {
        throw new Error("preview freeze requires a scheduled match with no score");
      }
      if (args.contentType === "recap" && (assembled.match_events.length === 0 || assembled.eventIntegrity.status === "mismatch")) {
        throw new Error("recap freeze requires match events and matching score integrity");
      }
      const tactical = await dependencies.extract(assembled);
      const input = { assembled, tacticalPoints: tactical.result.tactical_points };
      const fixture: FrozenFixture = {
        ...input,
        inputSha256: hashInput(input),
        frozenAt: dependencies.now().toISOString(),
        gitSha: dependencies.gitSha(),
        extraction: {
          promptVersion: tactical.promptVersion,
          modelVersion: tactical.modelVersion,
          costUsd: calculateCostUsd({
            modelVersion: tactical.modelVersion,
            inputTokens: tactical.usage.inputTokens,
            outputTokens: tactical.usage.outputTokens,
          }),
        },
      };
      const path = join(outputDirectory, `${safePart(matchId)}-${args.contentType}.json`);
      await mkdir(dirname(path), { recursive: true });
      await dependencies.write(path, `${JSON.stringify(fixture, null, 2)}\n`, {
        encoding: "utf8",
        flag: args.force ? "w" : "wx",
      });
      results.push({ matchId, path });
    } catch (error) {
      results.push({ matchId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function trialDetails(result: PipelineResult): PipelineTrialDetails {
  if (!result.trial) throw new Error("pipeline returned no trial details");
  return result.trial;
}

function blindSummaryLabel(variant: "A" | "B", xIsA: boolean, reveal: boolean): string {
  if (reveal) return variant;
  return (variant === "A") === xIsA ? "X" : "Y";
}

export async function runPromptExperiment(
  args: Pick<Args, "fixtures" | "maxUsd" | "dryRun" | "reveal">,
  dependencies: RunDependencies,
) {
  const fixtures = await Promise.all((args.fixtures ?? []).map(async (path) => ({
    path,
    fixture: JSON.parse(await dependencies.read(path, "utf8")) as FrozenFixture,
  })));
  if (fixtures.length === 0) throw new Error("No fixtures supplied");
  const contentTypeFor = (path: string): ContentType => path.endsWith("-preview.json") ? "preview" : "recap";
  const averages = new Map<ContentType, number>();
  for (const type of new Set(fixtures.map(({ path }) => contentTypeFor(path)))) {
    averages.set(type, await dependencies.averageCost(type));
  }
  const estimate = fixtures.reduce((sum, row) => sum + (averages.get(contentTypeFor(row.path)) ?? 0) * 2, 0);
  const random = seededRandom(dependencies.seed);
  const plans = fixtures.map(({ path, fixture }) => {
    const firstVariant: "A" | "B" = random() < 0.5 ? "A" : "B";
    const variants: Array<"A" | "B"> = [firstVariant, firstVariant === "A" ? "B" : "A"];
    const xIsA = random() < 0.5;
    return {
      path,
      matchId: fixture.assembled.match.id,
      contentType: contentTypeFor(path),
      variants,
      xIsA,
      fixture,
    };
  });
  if (args.dryRun) {
    return {
      estimateUsd: estimate,
      averageCostUsd: Object.fromEntries(averages),
      plans: plans.map(({ matchId, contentType: type, variants }) => ({ matchId, contentType: type, variants })),
      output: `[dry-run] ${plans.length} fixtures × 2 variants; estimate $${estimate.toFixed(4)}. No LLM calls or artifacts created.`,
    };
  }
  if (estimate > args.maxUsd) {
    return {
      output: `[budget] Estimated cost $${estimate.toFixed(4)} exceeds --max-usd $${args.maxUsd.toFixed(2)}. No LLM calls were made.`,
      estimateUsd: estimate,
      ledger: [],
      blindKey: {},
      spentUsd: 0,
      haltedByBudget: true,
    };
  }

  const outputDirectory = join(dependencies.outputRoot, dependencies.now().toISOString().replace(/[:.]/g, "-"));
  await dependencies.mkdir(join(outputDirectory, "prompts"), { recursive: true });
  await dependencies.mkdir(join(outputDirectory, "blind"), { recursive: true });
  const ledger: Array<Record<string, unknown>> = [];
  const blindKey: Record<string, Partial<Record<"X" | "Y", "A" | "B">>> = {};
  let spentUsd = 0;
  let haltedByBudget = false;

  for (const plan of plans) {
    let completed = 0;
    for (const variant of plan.variants) {
      const articleEstimate = averages.get(plan.contentType) ?? 0;
      if (spentUsd + articleEstimate > args.maxUsd) {
        haltedByBudget = true;
        break;
      }
      const result = await dependencies.generate(plan.matchId, plan.contentType, variant, {
        assembled: plan.fixture.assembled,
        tacticalPoints: plan.fixture.tacticalPoints,
      });
      const details = trialDetails(result);
      const costUsd = details.costUsd + details.comparisonQaCostUsd;
      spentUsd += costUsd;
      const recapLengths = plan.contentType === "recap"
        ? (() => {
            const split = splitRecapForPaywall(details.content);
            return { freeCharacters: split.freeMd.length, paidCharacters: split.lockedMd?.length ?? 0 };
          })()
        : {};
      ledger.push({
        matchId: plan.matchId,
        contentType: plan.contentType,
        variant,
        promptVersion: details.promptVersion,
        promptSha256: details.promptSha256,
        inputSha256: details.inputSha256,
        models: Object.fromEntries([
          ["extract-facts", plan.fixture.extraction.modelVersion],
          ...details.stageMetrics.map((stage) => [stage.name, stage.modelVersion]),
        ]),
        qa: details.qa,
        entityGate: details.entityGate,
        characters: details.content.length,
        ...recapLengths,
        costUsd,
        durationMs: details.durationMs,
        gitSha: plan.fixture.gitSha,
        randomSeed: dependencies.seed,
      });
      await dependencies.write(join(outputDirectory, "prompts", `${safePart(plan.matchId)}-${variant}.txt`), details.prompt, "utf8");
      const blindSlot = (variant === "A") === plan.xIsA ? "X" : "Y";
      blindKey[plan.matchId] ??= {};
      blindKey[plan.matchId]![blindSlot] = variant;
      await dependencies.write(join(outputDirectory, "blind", `${safePart(plan.matchId)}-${blindSlot}.md`), details.content, "utf8");
      completed += 1;
    }
    if (completed === 2) {
      const xVariant = plan.xIsA ? "A" : "B";
      const yVariant = xVariant === "A" ? "B" : "A";
      blindKey[plan.matchId] = { X: xVariant, Y: yVariant };
    } else {
      break;
    }
    if (haltedByBudget) break;
  }

  await dependencies.write(join(outputDirectory, "ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await dependencies.write(join(outputDirectory, "blind-key.json"), `${JSON.stringify(blindKey, null, 2)}\n`, "utf8");
  const reviewSheet = [
    "# 読み比べ評価シート",
    ...Object.keys(blindKey).flatMap((matchId) => [
      "", `## ${matchId}`, "", "| 評価項目 | X | Y | 同 |", "|---|---|---|---|",
      "| 1. 誤り・裏付けのない主張が少ない | | | |",
      "| 2. 同じ説明の繰り返しが少ない | | | |",
      "| 3. 中心の問いに根拠を使って答えている | | | |",
      "| 4. 読後にスコア表だけでは分からない理解が残る | | | |",
      "| 5. 有料部分へ読み進めたくなる | | | |",
      "", "総合選択: ______",
    ]),
  ].join("\n");
  await dependencies.write(join(outputDirectory, "review-sheet.md"), `${reviewSheet}\n`, "utf8");
  const summaryLabels = args.reveal ? (["A", "B"] as const) : (["X", "Y"] as const);
  const summaryRows = summaryLabels.map((label) => {
    const rows = ledger.filter((row) => blindSummaryLabel(row.variant as "A" | "B", blindKey[String(row.matchId)]?.X === "A", args.reveal) === label);
    const average = (key: string) => rows.length ? (rows.reduce((sum, row) => sum + Number((row.qa as { scores: Record<string, number> }).scores[key]), 0) / rows.length).toFixed(2) : "—";
    const verdicts = rows.map((row) => (row.qa as { verdict: string }).verdict).join(", ") || "—";
    return `| ${label} | ${average("information_density")} | ${average("japanese_quality")} | ${average("factual_grounding")} | ${average("tactical_depth")} | ${verdicts} | ${rows.length ? (rows.reduce((sum, row) => sum + Number(row.characters), 0) / rows.length).toFixed(0) : "—"} | ${rows.length ? (rows.reduce((sum, row) => sum + Number(row.costUsd), 0) / rows.length).toFixed(4) : "—"} |`;
  });
  const summary = [
    "# プロンプト比較サマリー", "",
    `- Fixtures: ${fixtures.length}`, `- Random seed: ${dependencies.seed}`,
    `- Cost estimate: $${estimate.toFixed(4)}`, `- Actual cost: $${spentUsd.toFixed(4)}`,
    ...(haltedByBudget ? ["- Stopped before the next call because the cost ceiling would be exceeded."] : []),
    "", `| Variant | Density avg | Japanese avg | Grounding avg | Tactical avg | QA verdicts | Characters avg | Cost avg (USD) |`,
    `|---|---:|---:|---:|---:|---|---:|---:|`, ...summaryRows,
  ].join("\n");
  await dependencies.write(join(outputDirectory, "summary.md"), `${summary}\n`, "utf8");
  return { outputDirectory, ledger, blindKey, spentUsd, haltedByBudget, summary };
}

async function main() {
  const args = parsePromptExperimentArgs(process.argv.slice(2));
  if (args.command === "freeze") {
    const results = await freezePromptFixtures(args);
    console.log(JSON.stringify(results, null, 2));
    if (results.some((row) => row.error)) process.exitCode = 1;
    return;
  }
  const db = getSupabaseServerClient();
  const result = await runPromptExperiment(args, {
    generate: async (matchId, contentType, variant, frozenInput) => generateMatchContent(matchId, contentType, "ja", {
      persist: false,
      frozenInput,
      promptVariant: variant,
      trialFirstAttemptOnly: true,
    }),
    averageCost: (contentType) => getRecentAverageArticleCost(db, contentType),
    read: readFile,
    write: writeFile,
    mkdir,
    now: () => new Date(),
    seed: randomInt(0x1_0000_0000),
    outputRoot: resolve("tmp", "prompt-ab"),
  });
  console.log(result.output ?? `Wrote ${result.ledger.length} trial rows to ${result.outputDirectory}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
