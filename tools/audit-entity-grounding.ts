/**
 * Audit already-published match_content for ungrounded person mentions.
 *
 * Dry-run is the default and performs no LLM calls:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/audit-entity-grounding.ts
 *
 * Execute after Owner approval:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/audit-entity-grounding.ts --confirm-owner-approved
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildAllowedPersonEntities } from "@/lib/content/allowed-entities";
import { getSupabaseServerClient } from "@/lib/db/server";
import { assembleMatchContentInput } from "@/lib/llm/stages/assemble";
import { verifyNarrativeEntities } from "@/lib/llm/stages/verify-entities";
import { SITE_URL } from "@/lib/site";

import type { Database } from "@/lib/db/types";
import type { EntityVerificationStageResponse } from "@/lib/llm/stages/verify-entities";
import type { AssembledContentInput, ContentLanguage } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContentType = "preview" | "recap";

export type CliOptions = {
  concurrency: number;
  contentType: ContentType | null;
  dryRun: boolean;
  limit: number | null;
  outputDir: string;
  ownerApproved: boolean;
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type PublishedContentRow = {
  id: string;
  content_md: string;
  content_type: ContentType;
  generated_at: string | null;
  language: ContentLanguage | null;
  match_id: string;
};

type AuditTarget = {
  contentId: string;
  contentMd: string;
  contentType: ContentType;
  generatedAt: string | null;
  language: ContentLanguage;
  matchId: string;
  url: string;
};

export type EntityAuditViolation = {
  allowedEntityCount: number;
  contentId: string;
  contentType: ContentType;
  generatedAt: string | null;
  language: ContentLanguage;
  matchId: string;
  ungroundedSurfaces: string[];
  url: string;
};

export type EntityAuditFailure = {
  contentId: string;
  contentType: ContentType;
  error: string;
  language: ContentLanguage;
  matchId: string;
  url: string;
};

export type EntityAuditReport = {
  generatedAt: string;
  options: {
    concurrency: number;
    contentType: ContentType | null;
    limit: number | null;
  };
  summary: {
    audited: number;
    failures: number;
    targetRows: number;
    violations: number;
  };
  failures: EntityAuditFailure[];
  violations: EntityAuditViolation[];
};

export type EntityAuditResult = {
  audited: number;
  costEstimate: EntityAuditCostEstimate;
  dryRun: boolean;
  failures: EntityAuditFailure[];
  reportPath: string | null;
  targetRows: number;
  violations: EntityAuditViolation[];
};

export type EntityAuditCostEstimate = {
  maxUsd: number;
  minUsd: number;
  targetCount: number;
};

type RunDeps = {
  assemble: (
    matchId: string,
    language: ContentLanguage,
    contentType: ContentType,
  ) => Promise<AssembledContentInput>;
  db: SupabaseClient<Database>;
  logger?: Logger;
  options: CliOptions;
  verify: (options: {
    narrative: string;
    allowedEntities: ReturnType<typeof buildAllowedPersonEntities>;
    sourcedFacts: AssembledContentInput["sourced_facts"];
  }) => Promise<EntityVerificationStageResponse>;
  writeReport?: (
    report: EntityAuditReport,
    outputDir: string,
  ) => Promise<string>;
};

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_OUTPUT_DIR = "tmp/entity-audit";
const ESTIMATED_COST_PER_TARGET_USD = {
  max: 0.001,
  min: 0.0005,
} as const;

function parsePositiveInteger(value: string, option: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid ${option} value: ${value}`);
  }

  return parsed;
}

function parseContentType(value: string): ContentType {
  if (value !== "preview" && value !== "recap") {
    throw new Error("--content-type must be preview or recap");
  }

  return value;
}

export function parseArgs(argv: string[]): CliOptions {
  let concurrency = DEFAULT_CONCURRENCY;
  let contentType: ContentType | null = null;
  let dryRun = true;
  let limit: number | null = null;
  let outputDir = DEFAULT_OUTPUT_DIR;
  let ownerApproved = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--content-type") {
      contentType = parseContentType(argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--content-type=")) {
      contentType = parseContentType(arg.slice("--content-type=".length));
      continue;
    }

    if (arg === "--limit") {
      limit = parsePositiveInteger(argv[index + 1] ?? "", "--limit");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--limit=")) {
      limit = parsePositiveInteger(arg.slice("--limit=".length), "--limit");
      continue;
    }

    if (arg === "--concurrency") {
      concurrency = parsePositiveInteger(
        argv[index + 1] ?? "",
        "--concurrency",
      );
      index += 1;
      continue;
    }

    if (arg?.startsWith("--concurrency=")) {
      concurrency = parsePositiveInteger(
        arg.slice("--concurrency=".length),
        "--concurrency",
      );
      continue;
    }

    if (arg === "--output-dir") {
      outputDir = argv[index + 1] ?? DEFAULT_OUTPUT_DIR;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--output-dir=")) {
      outputDir = arg.slice("--output-dir=".length) || DEFAULT_OUTPUT_DIR;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
      dryRun = false;
    }
  }

  return {
    concurrency,
    contentType,
    dryRun,
    limit,
    outputDir,
    ownerApproved,
  };
}

export function estimateEntityAuditCost(
  targetCount: number,
): EntityAuditCostEstimate {
  return {
    maxUsd: Number((targetCount * ESTIMATED_COST_PER_TARGET_USD.max).toFixed(2)),
    minUsd: Number((targetCount * ESTIMATED_COST_PER_TARGET_USD.min).toFixed(2)),
    targetCount,
  };
}

function buildMatchUrl(matchId: string) {
  return `${SITE_URL}/matches/${matchId}`;
}

async function loadPublishedContentRows(
  db: SupabaseClient<Database>,
  options: Pick<CliOptions, "contentType" | "limit">,
) {
  let query = db
    .from("match_content")
    .select("id, match_id, content_type, content_md, language, generated_at")
    .eq("status", "published")
    .order("generated_at", { ascending: true });

  if (options.contentType) {
    query = query.eq("content_type", options.contentType);
  } else {
    query = query.in("content_type", ["preview", "recap"]);
  }

  if (options.limit !== null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as PublishedContentRow[];
}

function toAuditTarget(row: PublishedContentRow): AuditTarget {
  return {
    contentId: row.id,
    contentMd: row.content_md,
    contentType: row.content_type,
    generatedAt: row.generated_at,
    language: row.language ?? "ja",
    matchId: row.match_id,
    url: buildMatchUrl(row.match_id),
  };
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex] as T, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );

  return results;
}

async function auditOneTarget(
  target: AuditTarget,
  deps: Pick<RunDeps, "assemble" | "verify">,
): Promise<{
  failure: EntityAuditFailure | null;
  violation: EntityAuditViolation | null;
}> {
  try {
    const assembled = await deps.assemble(
      target.matchId,
      target.language,
      target.contentType,
    );
    const allowedEntities = buildAllowedPersonEntities(assembled);
    const verification = await deps.verify({
      allowedEntities,
      narrative: target.contentMd,
      sourcedFacts: assembled.sourced_facts,
    });
    const ungroundedSurfaces = verification.result.ungroundedSurfaces;

    if (ungroundedSurfaces.length === 0) {
      return { failure: null, violation: null };
    }

    return {
      failure: null,
      violation: {
        allowedEntityCount: allowedEntities.length,
        contentId: target.contentId,
        contentType: target.contentType,
        generatedAt: target.generatedAt,
        language: target.language,
        matchId: target.matchId,
        ungroundedSurfaces,
        url: target.url,
      },
    };
  } catch (error) {
    return {
      failure: {
        contentId: target.contentId,
        contentType: target.contentType,
        error: error instanceof Error ? error.message : "unknown error",
        language: target.language,
        matchId: target.matchId,
        url: target.url,
      },
      violation: null,
    };
  }
}

export async function writeJsonReport(
  report: EntityAuditReport,
  outputDir: string,
) {
  await mkdir(outputDir, { recursive: true });

  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const reportPath = path.join(
    outputDir,
    `entity-grounding-audit-${timestamp}.json`,
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return reportPath;
}

export async function runEntityGroundingAudit({
  assemble,
  db,
  logger = console,
  options,
  verify,
  writeReport = writeJsonReport,
}: RunDeps): Promise<EntityAuditResult> {
  const rows = await loadPublishedContentRows(db, options);
  const targets = rows.map(toAuditTarget);
  const costEstimate = estimateEntityAuditCost(targets.length);

  logger.log(
    `Entity grounding audit targets: total=${targets.length} contentType=${options.contentType ?? "all"} limit=${options.limit ?? "none"}`,
  );
  logger.log(
    `Estimated LLM cost: $${costEstimate.minUsd.toFixed(2)}-$${costEstimate.maxUsd.toFixed(2)} for ${costEstimate.targetCount} published rows.`,
  );

  if (options.dryRun) {
    logger.log("[dry-run] No entity verification was executed.");
    logger.log(
      "Execution requires Owner approval and --confirm-owner-approved.",
    );

    return {
      audited: 0,
      costEstimate,
      dryRun: true,
      failures: [],
      reportPath: null,
      targetRows: targets.length,
      violations: [],
    };
  }

  if (!options.ownerApproved) {
    throw new Error(
      "Entity grounding audit requires Owner approval. Re-run with --confirm-owner-approved after approval.",
    );
  }

  const audited = await runWithConcurrency(
    targets,
    options.concurrency,
    (target) => auditOneTarget(target, { assemble, verify }),
  );
  const failures = audited
    .map((item) => item.failure)
    .filter((item): item is EntityAuditFailure => item !== null);
  const violations = audited
    .map((item) => item.violation)
    .filter((item): item is EntityAuditViolation => item !== null);
  const report: EntityAuditReport = {
    failures,
    generatedAt: new Date().toISOString(),
    options: {
      concurrency: options.concurrency,
      contentType: options.contentType,
      limit: options.limit,
    },
    summary: {
      audited: targets.length,
      failures: failures.length,
      targetRows: targets.length,
      violations: violations.length,
    },
    violations,
  };
  const reportPath = await writeReport(report, options.outputDir);

  logger.log(
    `Entity grounding audit complete: audited=${targets.length} violations=${violations.length} failures=${failures.length}`,
  );
  logger.log(`Report written: ${reportPath}`);

  return {
    audited: targets.length,
    costEstimate,
    dryRun: false,
    failures,
    reportPath,
    targetRows: targets.length,
    violations,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runEntityGroundingAudit({
    assemble: assembleMatchContentInput,
    db: getSupabaseServerClient(),
    options,
    verify: verifyNarrativeEntities,
  });
}

if (process.argv[1]?.endsWith("audit-entity-grounding.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
