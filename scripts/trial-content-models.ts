import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getSupabaseServerClient } from "@/lib/db/server";
import { MODELS } from "@/lib/llm/models";
import { generateMatchContent } from "@/lib/llm/pipeline";

import type { Database } from "@/lib/db/types";
import type { ContentModelOverrides } from "@/lib/llm/models";
import type { PipelineResult, PipelineTrialDetails } from "@/lib/llm/pipeline";
import type { ContentType } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type TrialConfig = "current" | "gpt6";

type TrialArgs = {
  matches: string[];
  contentType: ContentType;
  configs: TrialConfig[];
  maxUsd: number;
  dryRun: boolean;
  averageCostOverride?: number;
};

type TrialRow = {
  matchId: string;
  config: TrialConfig;
  result?: PipelineResult;
  error?: string;
};

type TrialDependencies = {
  generate: (
    matchId: string,
    contentType: ContentType,
    config: TrialConfig,
  ) => Promise<PipelineResult>;
  write: (path: string, contents: string) => Promise<void>;
};

const DAYS_OF_HISTORY = 30;
const COST_RETRY_MULTIPLIER = 2;
const DEFAULT_MAX_USD = 2;
const DEFAULT_DRY_RUN_AVERAGE_USD = 0.14;

export function parseTrialArgs(args: string[]): TrialArgs {
  const values = new Map<string, string[]>();
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!arg?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg ?? ""}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    const entries = values.get(arg) ?? [];
    entries.push(value);
    values.set(arg, entries);
    index += 1;
  }

  const matches = (values.get("--matches")?.[0] ?? "")
    .split(",")
    .map((matchId) => matchId.trim())
    .filter(Boolean);
  const contentType = values.get("--content-type")?.[0];
  const requestedConfigs = values.get("--config") ?? ["current", "gpt6"];
  const configs = ["current", "gpt6"].filter((config) =>
    requestedConfigs.includes(config),
  ) as TrialConfig[];
  const maxUsd = Number(values.get("--max-usd")?.[0] ?? DEFAULT_MAX_USD);
  const averageCostOverrideValue = values.get("--average-cost-usd")?.[0];
  const averageCostOverride =
    averageCostOverrideValue === undefined
      ? undefined
      : Number(averageCostOverrideValue);

  if (matches.length === 0) {
    throw new Error("--matches must contain at least one match id");
  }
  if (contentType !== "preview" && contentType !== "recap") {
    throw new Error("--content-type must be preview or recap");
  }
  if (
    configs.length !== 2 ||
    !configs.includes("current") ||
    !configs.includes("gpt6")
  ) {
    throw new Error("Use both --config current and --config gpt6 for comparison");
  }
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    throw new Error("--max-usd must be a positive number");
  }
  if (
    averageCostOverride !== undefined &&
    (!dryRun || !Number.isFinite(averageCostOverride) || averageCostOverride <= 0)
  ) {
    throw new Error("--average-cost-usd is a positive-value dry-run option only");
  }

  return {
    matches,
    contentType,
    configs,
    maxUsd,
    dryRun,
    ...(averageCostOverride !== undefined ? { averageCostOverride } : {}),
  };
}

export async function getRecentAverageArticleCost(
  db: SupabaseClient<Database>,
  contentType: ContentType,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - DAYS_OF_HISTORY * 24 * 60 * 60 * 1000,
  ).toISOString();
  const records: Array<{
    content_type: string;
    cost_usd: number | null;
    created_at: string;
    match_id: string | null;
    stage: number;
  }> = [];

  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await db
      .from("pipeline_runs")
      .select("content_type, cost_usd, created_at, match_id, stage")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);

    if (error) {
      throw error;
    }
    records.push(...(data ?? []));
    if ((data?.length ?? 0) < 1_000) {
      break;
    }
  }

  const activeRunByMatch = new Map<string, string>();
  const totalsByRun = new Map<string, { contentType: string; costUsd: number }>();
  let runSequence = 0;
  for (const record of records) {
    // Stage 5 sourced-facts searches run before the article pipeline starts and
    // must not be counted against the previous article run for this match.
    if (record.stage === 5 || !record.match_id) {
      continue;
    }
    const matchKey = `${record.match_id}:${record.content_type}`;
    if (record.stage === 1) {
      runSequence += 1;
      const runKey = `${matchKey}:${record.created_at}:${runSequence}`;
      activeRunByMatch.set(matchKey, runKey);
      totalsByRun.set(runKey, { contentType: record.content_type, costUsd: 0 });
      continue;
    }
    const activeRun = activeRunByMatch.get(matchKey);
    const total = activeRun ? totalsByRun.get(activeRun) : undefined;
    if (total) {
      total.costUsd += record.cost_usd ?? 0;
    }
  }

  const runCosts = [...totalsByRun.values()]
    .filter((run) => run.contentType === contentType && run.costUsd > 0)
    .map((run) => run.costUsd);
  if (runCosts.length === 0) {
    throw new Error(`No recent ${contentType} pipeline costs found in the last ${DAYS_OF_HISTORY} days`);
  }
  return runCosts.reduce((sum, cost) => sum + cost, 0) / runCosts.length;
}

function getModels(config: TrialConfig): ContentModelOverrides | undefined {
  return config === "gpt6"
    ? { narrative: "gpt-6-sol", fast: "gpt-6-luna" }
    : undefined;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function trialDetails(result: PipelineResult): PipelineTrialDetails | null {
  return result.trial ?? null;
}

export function formatTrialSummary(
  args: TrialArgs,
  estimateUsd: number,
  averageCostUsd: number,
  rows: TrialRow[],
): string {
  const lines = [
    "# LLM content model trial",
    "",
    `- Content type: ${args.contentType}`,
    `- Matches: ${args.matches.length}`,
    `- Configurations: ${args.configs.join(", ")}`,
    `- Recent average per article: $${averageCostUsd.toFixed(4)}`,
    `- Estimated maximum cost (including retry allowance): $${estimateUsd.toFixed(2)}`,
    "",
    "## Results",
    "",
    "| Match | Config | Status | Pipeline cost (USD) | Current QA cost | Total cost | Time (s) | Density | Japanese | Grounding | Tactical | QA | Current QA | Retries | Entity gate | Characters |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---|---:|",
  ];

  for (const row of rows) {
    const details = row.result ? trialDetails(row.result) : null;
    const qa = details?.qa ?? row.result?.qa;
    const scores = qa?.scores;
    const comparison = details?.comparisonQa;
    const comparisonScores = comparison?.scores
      ? JSON.stringify(comparison.scores)
      : "—";
    const totalCost = details
      ? details.costUsd + details.comparisonQaCostUsd
      : null;
    lines.push(
      `| ${row.matchId} | ${row.config} | ${row.error ? "error" : row.result?.status ?? "unknown"} | ${details ? details.costUsd.toFixed(4) : "—"} | ${details ? details.comparisonQaCostUsd.toFixed(4) : "—"} | ${totalCost?.toFixed(4) ?? "—"} | ${details ? (details.durationMs / 1_000).toFixed(1) : "—"} | ${scores?.information_density ?? "—"} | ${scores?.japanese_quality ?? "—"} | ${scores?.factual_grounding ?? "—"} | ${scores?.tactical_depth ?? "—"} | ${qa?.verdict ?? "—"} | ${comparison ? `${comparison.verdict} ${comparisonScores}` : "—"} | ${details?.retries ?? "—"} | ${details ? (details.entityGate.passed ? "pass" : "fail") : "—"} | ${details ? details.content.length : "—"} |`,
    );
    if (row.error) {
      lines.push(``, `**${row.matchId} / ${row.config} error:** ${row.error}`, ``);
    }
  }

  lines.push("", "## Averages by configuration", "");
  lines.push(
    "| Config | Completed | Pipeline cost | Comparison QA | Total cost | Time (s) | Density | Japanese | Grounding | Tactical | Current QA D/J/F/T | Retries |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|",
  );
  for (const config of args.configs) {
    const details = rows
      .filter((row) => row.config === config && !row.error && row.result)
      .map((row) => trialDetails(row.result!))
      .filter((value): value is PipelineTrialDetails => value !== null);
    const scores = details.map((value) => value.qa.scores);
    const comparisonScores = details
      .map((value) => value.comparisonQa?.scores)
      .filter((value): value is NonNullable<typeof value> => value !== undefined);
    const comparisonAverage = comparisonScores.length
      ? [
          average(comparisonScores.map((value) => value.information_density)),
          average(comparisonScores.map((value) => value.japanese_quality)),
          average(comparisonScores.map((value) => value.factual_grounding)),
          average(comparisonScores.map((value) => value.tactical_depth)),
        ]
          .map((value) => formatNumber(value, 2))
          .join(" / ")
      : "—";
    lines.push(
      `| ${config} | ${details.length} | ${formatNumber(average(details.map((value) => value.costUsd)))} | ${formatNumber(average(details.map((value) => value.comparisonQaCostUsd)))} | ${formatNumber(average(details.map((value) => value.costUsd + value.comparisonQaCostUsd)))} | ${formatNumber(average(details.map((value) => value.durationMs / 1_000)), 1)} | ${formatNumber(average(scores.map((value) => value.information_density)), 2)} | ${formatNumber(average(scores.map((value) => value.japanese_quality)), 2)} | ${formatNumber(average(scores.map((value) => value.factual_grounding)), 2)} | ${formatNumber(average(scores.map((value) => value.tactical_depth)), 2)} | ${comparisonAverage} | ${formatNumber(average(details.map((value) => value.retries)), 2)} |`,
    );
  }

  lines.push("", "## Stage averages", "");
  lines.push(
    "| Config | Stage | Time (s) | Input tokens | Output tokens | Cost (USD) |",
    "|---|---|---:|---:|---:|---:|",
  );
  for (const config of args.configs) {
    const metrics = rows
      .filter((row) => row.config === config && !row.error && row.result)
      .flatMap((row) => trialDetails(row.result!)?.stageMetrics ?? []);
    const names = [...new Set(metrics.map((metric) => metric.name))];
    for (const name of names) {
      const stage = metrics.filter((metric) => metric.name === name);
      lines.push(
        `| ${config} | ${name} | ${formatNumber(average(stage.map((metric) => metric.durationMs / 1_000)), 2)} | ${formatNumber(average(stage.map((metric) => metric.inputTokens)), 0)} | ${formatNumber(average(stage.map((metric) => metric.outputTokens)), 0)} | ${formatNumber(average(stage.map((metric) => metric.costUsd)), 5)} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function runTrialBatch(
  args: TrialArgs,
  averageCostUsd: number,
  dependencies: TrialDependencies,
): Promise<{ estimateUsd: number; rows: TrialRow[]; summary: string }> {
  const estimateUsd =
    args.matches.length * args.configs.length * averageCostUsd * COST_RETRY_MULTIPLIER;
  console.log(
    `Estimated LLM cost: $${estimateUsd.toFixed(2)} ` +
      `(${args.matches.length} matches × ${args.configs.length} configs × ` +
      `$${averageCostUsd.toFixed(4)} × ${COST_RETRY_MULTIPLIER} retry allowance)`,
  );
  if (estimateUsd > args.maxUsd) {
    throw new Error(
      `Estimated cost $${estimateUsd.toFixed(2)} exceeds --max-usd $${args.maxUsd.toFixed(2)}; no LLM calls were made`,
    );
  }
  if (args.dryRun) {
    console.log("[dry-run] No LLM calls or trial artifacts were created.");
    return {
      estimateUsd,
      rows: [],
      summary: formatTrialSummary(args, estimateUsd, averageCostUsd, []),
    };
  }

  const rows: TrialRow[] = [];
  for (const matchId of args.matches) {
    for (const config of args.configs) {
      try {
        rows.push({
          matchId,
          config,
          result: await dependencies.generate(matchId, args.contentType, config),
        });
      } catch (error) {
        rows.push({
          matchId,
          config,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const summary = formatTrialSummary(args, estimateUsd, averageCostUsd, rows);
  await dependencies.write("summary.md", summary);
  for (const row of rows) {
    const details = row.result ? trialDetails(row.result) : null;
    if (!details) {
      continue;
    }
    const qa = details.qa;
    const comparison = details.comparisonQa;
    const content = [
      `# ${row.matchId} — ${row.config}`,
      "",
      `Status: ${row.result?.status ?? "unknown"}`,
      `Cost: $${details.costUsd.toFixed(4)}`,
      `Duration: ${(details.durationMs / 1_000).toFixed(1)} seconds`,
      `QA: ${qa.verdict} (${JSON.stringify(qa.scores)})`,
      ...(comparison
        ? [`Current-model QA: ${comparison.verdict} (${JSON.stringify(comparison.scores)})`]
        : []),
      `Entity gate: ${details.entityGate.passed ? "pass" : "fail"}`,
      `Ungrounded surfaces: ${details.entityGate.ungroundedSurfaces.join(", ") || "none"}`,
      `Retries: ${details.retries}`,
      "",
      details.content,
      "",
    ].join("\n");
    await dependencies.write(`${safeFilePart(row.matchId)}-${row.config}.md`, content);
  }
  return { estimateUsd, rows, summary };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseTrialArgs(args);
  const db = parsed.averageCostOverride
    ? null
    : getSupabaseServerClient();
  const averageCostUsd =
    parsed.averageCostOverride ??
    (await getRecentAverageArticleCost(db!, parsed.contentType));
  if (parsed.averageCostOverride !== undefined) {
    console.log(
      `Using offline dry-run baseline $${averageCostUsd.toFixed(4)} per article from the spec estimate.`,
    );
  }

  const trialId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDirectory = join("tmp", "model-trial", trialId);
  const result = await runTrialBatch(parsed, averageCostUsd, {
    generate: (matchId, contentType, config) =>
      generateMatchContent(matchId, contentType, "ja", {
        ...(getModels(config) ? { models: getModels(config) } : {}),
        persist: false,
        ...(config === "gpt6" ? { comparisonQaModel: MODELS.FAST } : {}),
      }),
    write: async (path, contents) => {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(join(outputDirectory, path), contents, "utf8");
    },
  });

  if (parsed.dryRun) {
    console.log(result.summary);
    return;
  }
  console.log(`Trial results saved to ${outputDirectory}`);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
