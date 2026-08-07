import { readFileSync } from "node:fs";

import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent } from "@/lib/llm/pipeline";
import { PROMPT_VERSION as PREVIEW_VERSION } from "@/lib/llm/prompts/generate-preview";
import { PROMPT_VERSION as RECAP_VERSION } from "@/lib/llm/prompts/generate-recap";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContentType = "recap" | "preview";

type CliOptions = {
  contentType: ContentType;
  dryRun: boolean;
  family: string | null;
  fromVersion: string | null;
  matchIds: string[];
  ownerApproved: boolean;
};

type ContentRow = {
  match_id: string;
  prompt_version: string;
  match: {
    competition: {
      family: string | null;
    } | null;
  } | null;
};

type TargetRow = {
  family: string;
  matchId: string;
  promptVersion: string;
};

export type RegenerateOverseasContentResult = {
  byFamily: Record<string, number>;
  costEstimate: RegenerationCostEstimate;
  draft: number;
  failed: number;
  published: number;
  revalidationSkipped: number;
  regenerated: number;
  skipped: number;
  skippedCurrentVersion: number;
  skippedFamily: number;
  skippedFromVersion: number;
  skippedLeagueOne: number;
  targets: number;
  totalRows: number;
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type RunDeps = {
  contentType: ContentType;
  currentVersion?: string;
  db: SupabaseClient<Database>;
  dryRun: boolean;
  family: string | null;
  fromVersion: string | null;
  generateContent: (
    matchId: string,
    contentType: ContentType,
  ) => Promise<PipelineResult>;
  logger?: Logger;
  matchIds?: string[];
  ownerApproved?: boolean;
};

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;
const ESTIMATED_COST_PER_TARGET_USD = {
  max: 0.051,
  min: 0.023,
} as const;

export type RegenerationCostEstimate = {
  maxUsd: number;
  minUsd: number;
  targetCount: number;
};

export function estimateRegenerationCost(
  targetCount: number,
): RegenerationCostEstimate {
  return {
    maxUsd: Number(
      (targetCount * ESTIMATED_COST_PER_TARGET_USD.max).toFixed(2),
    ),
    minUsd: Number(
      (targetCount * ESTIMATED_COST_PER_TARGET_USD.min).toFixed(2),
    ),
    targetCount,
  };
}

function uniqueMatchIds(values: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/^\uFEFF/, "");

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    ids.push(normalized);
  }

  return ids;
}

function parseCommaSeparatedMatchIds(value: string | null | undefined) {
  return uniqueMatchIds((value ?? "").split(","));
}

function parseMatchIdsFile(path: string | null | undefined) {
  if (!path) {
    return [];
  }

  return uniqueMatchIds(readFileSync(path, "utf8").split(/\r?\n/));
}

export function parseArgs(argv: string[]): CliOptions {
  let contentType: ContentType = "recap";
  let dryRun = false;
  let family: string | null = null;
  let fromVersion: string | null = null;
  let matchIds: string[] = [];
  let ownerApproved = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--content-type") {
      const value = argv[index + 1];

      if (value !== "recap" && value !== "preview") {
        console.error("--content-type must be recap or preview");
        process.exit(1);
      }

      contentType = value;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--content-type=")) {
      const value = arg.slice("--content-type=".length);

      if (value !== "recap" && value !== "preview") {
        console.error("--content-type must be recap or preview");
        process.exit(1);
      }

      contentType = value;
      continue;
    }

    if (arg === "--family") {
      family = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      family = arg.slice("--family=".length) || null;
      continue;
    }

    if (arg === "--from-version") {
      fromVersion = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--from-version=")) {
      fromVersion = arg.slice("--from-version=".length) || null;
      continue;
    }

    if (arg === "--match-ids") {
      matchIds = uniqueMatchIds([
        ...matchIds,
        ...parseCommaSeparatedMatchIds(argv[index + 1]),
      ]);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--match-ids=")) {
      matchIds = uniqueMatchIds([
        ...matchIds,
        ...parseCommaSeparatedMatchIds(arg.slice("--match-ids=".length)),
      ]);
      continue;
    }

    if (arg === "--match-ids-file") {
      matchIds = uniqueMatchIds([
        ...matchIds,
        ...parseMatchIdsFile(argv[index + 1]),
      ]);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--match-ids-file=")) {
      matchIds = uniqueMatchIds([
        ...matchIds,
        ...parseMatchIdsFile(arg.slice("--match-ids-file=".length)),
      ]);
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      ownerApproved = true;
    }
  }

  return {
    contentType,
    dryRun,
    family,
    fromVersion,
    matchIds,
    ownerApproved,
  };
}

export function getCurrentPromptVersion(contentType: ContentType) {
  return contentType === "recap" ? RECAP_VERSION : PREVIEW_VERSION;
}

function getFamily(row: ContentRow) {
  return row.match?.competition?.family ?? null;
}

function buildTargetRows(params: {
  contentRows: ContentRow[];
  currentVersion: string;
  family: string | null;
  fromVersion: string | null;
  logger?: Logger;
  matchIds: string[];
}) {
  const counters = {
    skippedCurrentVersion: 0,
    skippedFamily: 0,
    skippedFromVersion: 0,
    skippedLeagueOne: 0,
  };
  const targets: TargetRow[] = [];

  if (params.matchIds.length > 0) {
    const rowsByMatchId = new Map(
      params.contentRows.map((row) => [row.match_id, row]),
    );

    for (const matchId of params.matchIds) {
      const row = rowsByMatchId.get(matchId);

      if (!row) {
        params.logger?.warn(
          `[regenerate-overseas-content] no existing recap row found for match_id=${matchId}; skipped.`,
        );
        continue;
      }

      targets.push({
        family: getFamily(row) ?? "unknown",
        matchId: row.match_id,
        promptVersion: row.prompt_version,
      });
    }

    return { ...counters, targets };
  }

  for (const row of params.contentRows) {
    const rowFamily = getFamily(row);

    if (rowFamily === "league-one") {
      counters.skippedLeagueOne += 1;
      continue;
    }

    if (!rowFamily || (params.family && rowFamily !== params.family)) {
      counters.skippedFamily += 1;
      continue;
    }

    if (row.prompt_version === params.currentVersion) {
      counters.skippedCurrentVersion += 1;
      continue;
    }

    if (
      params.fromVersion !== null &&
      row.prompt_version !== params.fromVersion
    ) {
      counters.skippedFromVersion += 1;
      continue;
    }

    targets.push({
      family: rowFamily,
      matchId: row.match_id,
      promptVersion: row.prompt_version,
    });
  }

  return { ...counters, targets };
}

function countByFamily(targets: TargetRow[]) {
  return targets.reduce<Record<string, number>>((acc, target) => {
    acc[target.family] = (acc[target.family] ?? 0) + 1;

    return acc;
  }, {});
}

async function getRegenerationCandidates(
  db: SupabaseClient<Database>,
  contentType: ContentType,
  matchIds: string[],
) {
  let query = db
    .from("match_content")
    .select(
      `
        match_id,
        prompt_version,
        match:matches!match_content_match_id_fkey (
          competition:competitions!matches_competition_id_fkey (
            family
          )
        )
      `,
    )
    .eq("content_type", contentType)
    .in("status", [...EXISTING_CONTENT_STATUSES]);

  if (matchIds.length > 0) {
    query = query.in("match_id", matchIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as ContentRow[];
}

export async function runRegenerateOverseasContent({
  contentType,
  currentVersion = getCurrentPromptVersion(contentType),
  db,
  dryRun,
  family,
  fromVersion,
  generateContent,
  logger = console,
  matchIds = [],
  ownerApproved = false,
}: RunDeps): Promise<RegenerateOverseasContentResult> {
  const contentRows = await getRegenerationCandidates(
    db,
    contentType,
    matchIds,
  );
  const {
    skippedCurrentVersion,
    skippedFamily,
    skippedFromVersion,
    skippedLeagueOne,
    targets,
  } = buildTargetRows({
    contentRows,
    currentVersion,
    family,
    fromVersion,
    logger,
    matchIds,
  });
  const byFamily = countByFamily(targets);
  const costEstimate = estimateRegenerationCost(targets.length);

  logger.log(
    `Overseas ${contentType} regeneration targets: total=${contentRows.length} target=${targets.length} currentVersion=${currentVersion} fromVersion=${matchIds.length > 0 ? "ignored" : (fromVersion ?? "any")} matchIds=${matchIds.length}`,
  );
  logger.log(`By family: ${JSON.stringify(byFamily)}`);
  logger.log(
    `Estimated LLM cost: $${costEstimate.minUsd.toFixed(2)}-$${costEstimate.maxUsd.toFixed(2)} for ${costEstimate.targetCount} ${contentType} targets.`,
  );

  const result: RegenerateOverseasContentResult = {
    byFamily,
    costEstimate,
    draft: 0,
    failed: 0,
    published: 0,
    revalidationSkipped: 0,
    regenerated: 0,
    skipped: 0,
    skippedCurrentVersion,
    skippedFamily,
    skippedFromVersion,
    skippedLeagueOne,
    targets: targets.length,
    totalRows: contentRows.length,
  };

  if (dryRun) {
    logger.log("[dry-run] No content regeneration was executed.");
    logger.log(
      "Execution requires Owner approval and --confirm-owner-approved.",
    );

    return result;
  }

  if (!ownerApproved) {
    throw new Error(
      "Regeneration requires Owner approval. Re-run with --confirm-owner-approved after approval.",
    );
  }

  for (const target of targets) {
    try {
      const generated = await generateContent(target.matchId, contentType);
      result.regenerated += 1;
      result[generated.status] += 1;
      if (generated.cacheRevalidationSkipped) {
        result.revalidationSkipped += 1;
      }
      logger.log(
        `Regenerated ${contentType} for ${target.matchId}: ${generated.status} (${target.promptVersion} -> ${currentVersion})`,
      );
    } catch (error) {
      result.failed += 1;
      logger.error(
        `[regenerate-overseas-content] failed for ${target.matchId}`,
        error,
      );
    }
  }

  logger.log(
    `Overseas ${contentType} regeneration complete: regenerated=${result.regenerated} published=${result.published} draft=${result.draft} skipped=${result.skipped} failed=${result.failed} revalidation_skipped=${result.revalidationSkipped}`,
  );

  if (result.revalidationSkipped > 0) {
    logger.warn(
      `[regenerate-overseas-content] Cache revalidation was skipped for ${result.revalidationSkipped} regenerated content item(s). The production site may not yet show the updated content; run cache revalidation separately.`,
    );
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runRegenerateOverseasContent({
    contentType: options.contentType,
    db: getSupabaseServerClient(),
    dryRun: options.dryRun,
    family: options.family,
    fromVersion: options.fromVersion,
    generateContent: (matchId, contentType) =>
      generateMatchContent(matchId, contentType),
    matchIds: options.matchIds,
    ownerApproved: options.ownerApproved,
  });
}

if (process.argv[1]?.endsWith("regenerate-overseas-content.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
