import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getSupabaseServerClient } from "@/lib/db/server";
import {
  loadQualityGateInput,
  runQualityGateForNarrative,
} from "@/lib/llm/pipeline";
import { calculateCostUsd } from "@/lib/llm/pricing";
import { getDeterministicQaGuardIssues } from "@/lib/llm/stages/qa";

import type { ContentType } from "@/lib/llm/types";

type ComparisonArgs = {
  contentType: ContentType;
  sinceDays: number;
  published: number;
  draft: number;
  files: { matchId: string; path: string }[];
  baseline: string;
  candidate: string;
  maxUsd: number;
  dryRun: boolean;
};
type Article = {
  matchId: string;
  rowId: string;
  status: string;
  narrative: string;
};
type GateResult = Awaited<ReturnType<typeof runQualityGateForNarrative>>;
type Grade = { result: GateResult; costUsd: number } | { error: string };
type ComparisonRow = {
  article: Article;
  matchLabel?: string;
  skipReason?: string;
  baseline?: Grade;
  candidate?: Grade;
};
const ARTICLE_ESTIMATE_USD = 0.004;
const RETRY_ALLOWANCE = 2;

export function parseComparisonArgs(args: string[]): ComparisonArgs {
  const values = new Map<string, string[]>();
  const supported = new Set([
    "--content-type",
    "--since-days",
    "--published",
    "--draft",
    "--file",
    "--baseline",
    "--candidate",
    "--max-usd",
  ]);
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]!;
    if (key === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!supported.has(key)) throw new Error(`Unexpected argument: ${key}`);
    const value = args[++index];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${key}`);
    if (key !== "--file" && values.has(key))
      throw new Error(`Repeated argument: ${key}`);
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const contentType = values.get("--content-type")?.[0];
  if (contentType !== "preview" && contentType !== "recap") {
    throw new Error("--content-type must be preview or recap");
  }
  const number = (
    key: string,
    fallback: number,
    integer = true,
    allowZero = false,
  ) => {
    const value = Number(values.get(key)?.[0] ?? fallback);
    if (
      !Number.isFinite(value) ||
      (integer && !Number.isInteger(value)) ||
      (allowZero ? value < 0 : value <= 0)
    ) {
      throw new Error(`Invalid value for ${key}`);
    }
    return value;
  };
  const files = (values.get("--file") ?? []).map((value) => {
    const colon = value.indexOf(":");
    if (colon <= 0 || colon === value.length - 1)
      throw new Error("--file must be <matchId>:<path>");
    return { matchId: value.slice(0, colon), path: value.slice(colon + 1) };
  });
  return {
    contentType,
    sinceDays: number("--since-days", 21),
    published: number("--published", 30, true, true),
    draft: number("--draft", 10, true, true),
    files,
    baseline: values.get("--baseline")?.[0] ?? "gpt-5.6-luna",
    candidate: values.get("--candidate")?.[0] ?? "gpt-6-luna",
    maxUsd: number("--max-usd", 0.5, false),
    dryRun,
  };
}

export function stripTrialHeader(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "");
  // Only remove the metadata emitted by trial-content-models, never an ordinary article heading.
  const header =
    /^# [^\r\n]+ — [^\r\n]+\r?\n[\s\S]*?^Retries: [^\r\n]*\r?\n/m.exec(
      normalized,
    );
  if (header?.index !== 0) return normalized;
  const body = normalized.slice(header[0].length);
  const heading = /^# /m.exec(body);
  if (!heading)
    throw new Error("Trial Markdown has no article heading after Retries");
  return body.slice(heading.index);
}

async function selectArticles(
  args: ComparisonArgs,
  now: Date,
): Promise<Article[]> {
  const articles: Article[] = [];
  const cutoff = new Date(
    now.getTime() - args.sinceDays * 86_400_000,
  ).toISOString();
  for (const status of ["published", "draft"] as const) {
    if (args[status] === 0) continue;
    const { data, error } = await getSupabaseServerClient()
      .from("match_content")
      .select("id, match_id, content_md, status")
      .eq("language", "ja")
      .eq("content_type", args.contentType)
      .eq("status", status)
      .gte("generated_at", cutoff)
      .order("generated_at", { ascending: false })
      .limit(args[status]);
    if (error) throw error;
    articles.push(
      ...(data ?? []).map((row) => ({
        matchId: row.match_id,
        rowId: row.id,
        status: row.status,
        narrative: row.content_md,
      })),
    );
  }
  const fileCounts = new Map<string, number>();
  for (const file of args.files) {
    const count = (fileCounts.get(file.matchId) ?? 0) + 1;
    fileCounts.set(file.matchId, count);
    articles.push({
      matchId: file.matchId,
      rowId: count === 1 ? "file" : `file-${count}`,
      status: "file",
      narrative: stripTrialHeader(await readFile(file.path, "utf8")),
    });
  }
  return articles;
}

function qa(grade?: Grade) {
  return grade && "result" in grade
    ? grade.result.qaResponse.result
    : undefined;
}
function decision(grade?: Grade): "publish" | "reject" | undefined {
  const result = qa(grade);
  return result
    ? result.verdict === "publish"
      ? "publish"
      : "reject"
    : undefined;
}
function differs(row: ComparisonRow): boolean {
  const baseline = qa(row.baseline);
  const candidate = qa(row.candidate);
  return (
    !!baseline &&
    !!candidate &&
    decision(row.baseline) !== decision(row.candidate)
  );
}
function groundingDelta(row: ComparisonRow): number | null {
  const baseline = qa(row.baseline);
  const candidate = qa(row.candidate);
  return baseline && candidate
    ? candidate.scores.factual_grounding - baseline.scores.factual_grounding
    : null;
}
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}
function formatGrade(grade?: Grade): string {
  const result = qa(grade);
  if (!result)
    return grade && "error" in grade ? `error: ${cell(grade.error)}` : "—";
  const s = result.scores;
  return `${result.verdict} (${s.information_density}/${s.japanese_quality}/${s.factual_grounding}/${s.tactical_depth})`;
}

function formatSummary(
  args: ComparisonArgs,
  estimate: number,
  rows: ComparisonRow[],
): string {
  const totalCost = rows.reduce(
    (sum, row) =>
      sum +
      [row.baseline, row.candidate].reduce(
        (cost, grade) =>
          cost + (grade && "costUsd" in grade ? grade.costUsd : 0),
        0,
      ),
    0,
  );
  const skipped = rows.filter((row) => row.skipReason);
  const matrix = (baseline: string, candidate: string) =>
    rows.filter(
      (row) =>
        decision(row.baseline) === baseline &&
        decision(row.candidate) === candidate,
    ).length;
  const lines = [
    "# QA model comparison",
    "",
    `- Articles: ${rows.length}`,
    `- Skipped: ${skipped.length}`,
    ...skipped.map(
      (row) =>
        `  - ${row.article.matchId} / ${row.article.rowId}: ${row.skipReason}`,
    ),
    `- Baseline: ${args.baseline}; candidate: ${args.candidate}`,
    `- Estimated maximum cost: $${estimate.toFixed(4)}`,
    `- Actual cost (returned usage): $${totalCost.toFixed(6)}`,
    "",
    "| Baseline / Candidate | publish | reject |",
    "|---|---:|---:|",
    `| publish | ${matrix("publish", "publish")} | ${matrix("publish", "reject")} |`,
    `| reject | ${matrix("reject", "publish")} | ${matrix("reject", "reject")} |`,
    "",
    "Scores: information_density / japanese_quality / factual_grounding / tactical_depth.",
    "retry is counted as reject (not publish); raw verdicts are preserved below. Errors and skips are excluded from the 2×2 counts.",
  ];
  for (const [title, group] of [
    ["Disagreements", rows.filter(differs)],
    [
      "Agreements",
      rows.filter(
        (row) =>
          !row.skipReason &&
          qa(row.baseline) &&
          qa(row.candidate) &&
          !differs(row),
      ),
    ],
    [
      "Errors",
      rows.filter(
        (row) => !row.skipReason && (!qa(row.baseline) || !qa(row.candidate)),
      ),
    ],
  ] as const) {
    lines.push(
      "",
      `## ${title}`,
      "",
      "| matchId / article | Match | Original status | Baseline verdict (D/J/F/T) | Candidate verdict (D/J/F/T) | Grounding Δ (candidate − baseline) |",
      "|---|---|---|---|---|---:|",
    );
    for (const row of group)
      lines.push(
        `| ${cell(row.article.matchId)} / ${cell(row.article.rowId)} | ${cell(row.matchLabel ?? "—")} | ${row.article.status} | ${formatGrade(row.baseline)} | ${formatGrade(row.candidate)} | ${groundingDelta(row) ?? "—"} |`,
      );
  }
  return lines.join("\n") + "\n";
}

function formatGradeDetails(
  label: string,
  model: string,
  grade?: Grade,
): string[] {
  if (!grade || "error" in grade)
    return [`## ${label}: ${model}`, "", formatGrade(grade)];
  const result = grade.result.qaResponse.result;
  const guards = getDeterministicQaGuardIssues(result);
  return [
    `## ${label}: ${model}`,
    "",
    `Verdict and scores: ${formatGrade(grade)}`,
    "",
    "### LLM issues",
    "",
    JSON.stringify(
      result.issues.filter((issue) => !guards.includes(issue)),
      null,
      2,
    ),
    "",
    "### Deterministic guard issues",
    "",
    JSON.stringify(guards, null, 2),
    "",
    "### All issues (full text)",
    "",
    JSON.stringify(result.issues, null, 2),
    "",
    "### Ungrounded surfaces",
    "",
    JSON.stringify(
      grade.result.entityVerification?.result.ungroundedSurfaces ?? [],
      null,
      2,
    ),
  ];
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseComparisonArgs(args);
  const now = new Date();
  const articles = await selectArticles(parsed, now);
  // Two gates/article, each QA + entity verification; allow 2× for internal retries.
  // 40 articles × 2 models × $0.004 × 2 = $0.64; no narrative-generation calls.
  const estimate = articles.length * 2 * ARTICLE_ESTIMATE_USD * RETRY_ALLOWANCE;
  console.log(
    `Estimated LLM cost: $${estimate.toFixed(4)} (${articles.length} articles × 2 models × $${ARTICLE_ESTIMATE_USD.toFixed(4)} × ${RETRY_ALLOWANCE} retry allowance)`,
  );
  for (const article of articles)
    console.log(`${article.matchId} / ${article.rowId} (${article.status})`);
  if (estimate > parsed.maxUsd)
    throw new Error(
      `Estimated cost $${estimate.toFixed(4)} exceeds --max-usd $${parsed.maxUsd.toFixed(4)}; no LLM calls were made`,
    );
  if (parsed.dryRun) {
    console.log("[dry-run] No LLM calls or comparison artifacts were created.");
    return;
  }

  const outputDirectory = join(
    "tmp",
    "qa-compare",
    now.toISOString().replace(/[:.]/g, "-"),
  );
  const write = async (name: string, content: string) => {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(join(outputDirectory, name), content, "utf8");
  };
  const rows: ComparisonRow[] = [];
  for (const article of articles) {
    const input = await loadQualityGateInput(
      article.matchId,
      parsed.contentType,
      "ja",
    );
    if ("skipReason" in input) {
      rows.push({ article, skipReason: input.skipReason });
      continue;
    }
    const { usable } = input;
    const row: ComparisonRow = {
      article,
      matchLabel: `${usable.match.home_team?.name_ja ?? usable.match.home_team?.name ?? "Home"} 対 ${usable.match.away_team?.name_ja ?? usable.match.away_team?.name ?? "Away"}`,
    };
    for (const side of ["baseline", "candidate"] as const) {
      try {
        const result = await runQualityGateForNarrative({
          usable,
          contentType: parsed.contentType,
          language: "ja",
          narrative: article.narrative,
          retryCount: 0,
          verifyEntities: true,
          qaModel: parsed[side],
          entityModel: parsed[side],
        });
        const responses = [
          result.qaResponse,
          ...(result.entityVerification ? [result.entityVerification] : []),
        ];
        row[side] = {
          result,
          costUsd: responses.reduce(
            (sum, response) =>
              sum +
              calculateCostUsd({
                modelVersion: response.modelVersion,
                ...response.usage,
              }),
            0,
          ),
        };
      } catch (error) {
        row[side] = {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    rows.push(row);
    if (differs(row) || Math.abs(groundingDelta(row) ?? 0) >= 2) {
      const filePart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
      await write(
        `${filePart(article.matchId)}-${filePart(article.rowId)}.md`,
        [
          `# ${row.matchLabel}`,
          "",
          `Match: ${article.matchId}; article: ${article.rowId}; original status: ${article.status}`,
          "",
          `Final score: ${usable.match.home_score ?? "—"} - ${usable.match.away_score ?? "—"}`,
          "",
          "## Score timeline",
          "",
          JSON.stringify(usable.score_timeline, null, 2),
          "",
          "## Narrative",
          "",
          article.narrative,
          "",
          ...formatGradeDetails("Baseline", parsed.baseline, row.baseline),
          "",
          ...formatGradeDetails("Candidate", parsed.candidate, row.candidate),
          "",
        ].join("\n"),
      );
    }
  }
  await write("summary.md", formatSummary(parsed, estimate, rows));
  console.log(`Comparison results saved to ${outputDirectory}`);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
