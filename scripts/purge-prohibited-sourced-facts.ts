/**
 * Deletes cached sourced facts whose source domain is not currently allowed.
 *
 * Usage:
 *   pnpm tsx scripts/purge-prohibited-sourced-facts.ts [--dry-run] [--confirm-owner-approved]
 */

import { pathToFileURL } from "node:url";

import { getSupabaseServerClient } from "@/lib/db/server";
import { isAllowedSourcedFactDomain } from "@/lib/llm/sourced-facts/allowlist";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
};

type SourcedFactRow = {
  id: string;
  match_id: string;
  source_domain: string | null;
};

export type SourcedFactPurgePlan = {
  allowedCount: number;
  disallowedIds: string[];
  disallowedByDomain: Record<string, number>;
  matchesWithoutAllowedFacts: number;
  totalRows: number;
};

export type SourcedFactPurgeResult = SourcedFactPurgePlan & {
  deletedCount: number;
  dryRun: boolean;
};

type Logger = Pick<Console, "log">;

function sourceDomainLabel(value: string | null) {
  const domain = value?.trim() ?? "";

  return domain.length > 0 ? domain : "(missing)";
}

export function buildSourcedFactPurgePlan(
  rows: SourcedFactRow[],
  isAllowedDomain: (domain: string) => boolean = isAllowedSourcedFactDomain,
): SourcedFactPurgePlan {
  const disallowedIds: string[] = [];
  const disallowedByDomain: Record<string, number> = {};
  const matchIds = new Set<string>();
  const matchIdsWithAllowedFacts = new Set<string>();

  for (const row of rows) {
    matchIds.add(row.match_id);
    const sourceDomain = row.source_domain?.trim() ?? "";

    if (sourceDomain.length > 0 && isAllowedDomain(sourceDomain)) {
      matchIdsWithAllowedFacts.add(row.match_id);
      continue;
    }

    disallowedIds.push(row.id);
    const domain = sourceDomainLabel(row.source_domain);
    disallowedByDomain[domain] = (disallowedByDomain[domain] ?? 0) + 1;
  }

  return {
    allowedCount: rows.length - disallowedIds.length,
    disallowedIds,
    disallowedByDomain,
    matchesWithoutAllowedFacts:
      matchIds.size - matchIdsWithAllowedFacts.size,
    totalRows: rows.length,
  };
}

export function parseOptions(argv: string[]): CliOptions {
  let dryRun = true;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm-owner-approved") {
      dryRun = false;
      continue;
    }

    throw new Error(
      "Usage: pnpm tsx scripts/purge-prohibited-sourced-facts.ts [--dry-run] [--confirm-owner-approved]",
    );
  }

  return { dryRun };
}

async function loadSourcedFactRows(db: SupabaseClient<Database>) {
  const { data, error } = await db
    .from("match_sourced_facts")
    .select("id, match_id, source_domain");

  if (error) {
    throw error;
  }

  return (data ?? []) as SourcedFactRow[];
}

function logPurgePlan(plan: SourcedFactPurgePlan, logger: Logger) {
  logger.log(
    `Sourced fact purge targets: total=${plan.totalRows} allowed=${plan.allowedCount} delete=${plan.disallowedIds.length}`,
  );

  for (const [domain, count] of Object.entries(plan.disallowedByDomain).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    logger.log(`  ${domain}: ${count}`);
  }

  logger.log(
    `Matches without allowed sourced facts: ${plan.matchesWithoutAllowedFacts}`,
  );
}

export async function runSourcedFactPurge({
  db,
  dryRun = true,
  logger = console,
}: {
  db: SupabaseClient<Database>;
  dryRun?: boolean;
  logger?: Logger;
}): Promise<SourcedFactPurgeResult> {
  const plan = buildSourcedFactPurgePlan(await loadSourcedFactRows(db));
  logPurgePlan(plan, logger);

  if (dryRun || plan.disallowedIds.length === 0) {
    logger.log("[dry-run] No sourced facts were deleted.");

    return {
      ...plan,
      deletedCount: 0,
      dryRun,
    };
  }

  const { data, error } = await db
    .from("match_sourced_facts")
    .delete()
    .in("id", plan.disallowedIds)
    .select("id");

  if (error) {
    throw error;
  }

  const deletedCount = data?.length ?? 0;
  logger.log(`Deleted ${deletedCount} sourced fact(s).`);

  return {
    ...plan,
    deletedCount,
    dryRun,
  };
}

async function main() {
  const { dryRun } = parseOptions(process.argv.slice(2));

  await runSourcedFactPurge({
    db: getSupabaseServerClient(),
    dryRun,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
