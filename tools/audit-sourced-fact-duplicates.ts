/**
 * Reports existing sourced-fact accumulation without changing any database row.
 *
 * Usage:
 *   node --env-file=.env.production.local tools/run-ts.cjs tools/audit-sourced-fact-duplicates.ts
 */

import { getSupabaseServerClient } from "@/lib/db/server";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type SourcedFactRow = {
  content_type: string;
  match_id: string;
  source_domain: string;
};

export type SourcedFactDuplicateAudit = {
  byMatchAndContentType: Array<{
    contentType: string;
    factCount: number;
    matchId: string;
  }>;
  duplicateSourceGroups: Array<{
    contentType: string;
    factCount: number;
    matchId: string;
    sourceDomain: string;
  }>;
  totalFacts: number;
};

function sortByFactCount<T extends { factCount: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      right.factCount - left.factCount ||
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

export function summarizeSourcedFactDuplicates(
  rows: SourcedFactRow[],
): SourcedFactDuplicateAudit {
  const byMatchAndContentType = new Map<string, number>();
  const bySourceDomain = new Map<string, number>();

  for (const row of rows) {
    const matchTypeKey = `${row.match_id}\u0000${row.content_type}`;
    const sourceKey = `${matchTypeKey}\u0000${row.source_domain}`;
    byMatchAndContentType.set(
      matchTypeKey,
      (byMatchAndContentType.get(matchTypeKey) ?? 0) + 1,
    );
    bySourceDomain.set(sourceKey, (bySourceDomain.get(sourceKey) ?? 0) + 1);
  }

  const matchCounts = sortByFactCount(
    [...byMatchAndContentType].map(([key, factCount]) => {
      const [matchId, contentType] = key.split("\u0000");
      return {
        contentType: contentType ?? "",
        factCount,
        matchId: matchId ?? "",
      };
    }),
  );
  const duplicateSourceGroups = sortByFactCount(
    [...bySourceDomain].flatMap(([key, factCount]) => {
      if (factCount < 2) {
        return [];
      }

      const [matchId, contentType, sourceDomain] = key.split("\u0000");
      return [
        {
          contentType: contentType ?? "",
          factCount,
          matchId: matchId ?? "",
          sourceDomain: sourceDomain ?? "",
        },
      ];
    }),
  );

  return {
    byMatchAndContentType: matchCounts,
    duplicateSourceGroups,
    totalFacts: rows.length,
  };
}

export async function auditSourcedFactDuplicates(
  db: SupabaseClient<Database>,
): Promise<SourcedFactDuplicateAudit> {
  const { data, error } = await db
    .from("match_sourced_facts")
    .select("match_id, content_type, source_domain");

  if (error) {
    throw error;
  }

  return summarizeSourcedFactDuplicates((data ?? []) as SourcedFactRow[]);
}

export function logSourcedFactDuplicateAudit(
  audit: SourcedFactDuplicateAudit,
  logger: Pick<Console, "log"> = console,
) {
  logger.log(`Sourced facts: total=${audit.totalFacts}`);
  logger.log("Top match/content-type fact counts:");
  for (const row of audit.byMatchAndContentType.slice(0, 20)) {
    logger.log(`  ${row.matchId} ${row.contentType}: ${row.factCount}`);
  }
  logger.log("Duplicate source-domain groups (same match/content type):");
  for (const row of audit.duplicateSourceGroups.slice(0, 20)) {
    logger.log(
      `  ${row.matchId} ${row.contentType} ${row.sourceDomain}: ${row.factCount}`,
    );
  }
}

async function main() {
  const audit = await auditSourcedFactDuplicates(getSupabaseServerClient());
  logSourcedFactDuplicateAudit(audit);
}

if (process.argv[1]?.endsWith("audit-sourced-fact-duplicates.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
