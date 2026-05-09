import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent } from "@/lib/llm/pipeline";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  family: string;
  limit: number;
};

type MatchRow = {
  id: string;
  competition: {
    family: string;
  } | null;
};

type ExistingContentRow = {
  match_id: string;
};

export type FamilyRecapGenerationResult = {
  failed: number;
  generated: number;
  limit: number;
  skipped: number;
  targets: number;
  totalFinished: number;
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type RunDeps = {
  db: SupabaseClient<Database>;
  dryRun: boolean;
  family: string;
  generateContent: (
    matchId: string,
    contentType: "recap",
  ) => Promise<PipelineResult>;
  limit: number;
  logger?: Logger;
};

const DEFAULT_LIMIT = 10;
const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;
const USAGE =
  "Usage: generate-recaps.ts --family FAMILY [--limit N] [--dry-run]";

function parseLimit(value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error("--limit must be a positive integer");
    console.error(USAGE);
    process.exit(1);
  }

  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let family: string | null = null;
  let limit = DEFAULT_LIMIT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--family") {
      family = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      family = arg.slice("--family=".length) || null;
      continue;
    }

    if (arg === "--limit") {
      limit = parseLimit(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--limit=")) {
      limit = parseLimit(arg.slice("--limit=".length));
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  if (!family) {
    console.error(USAGE);
    process.exit(1);
  }

  return { dryRun, family, limit };
}

async function getFinishedMatchesByFamily(
  db: SupabaseClient<Database>,
  family: string,
) {
  const { data, error } = await db
    .from("matches")
    .select(
      `
        id,
        competition:competitions!matches_competition_id_fkey!inner (
          family
        )
      `,
    )
    .eq("status", "finished")
    .eq("competition.family", family)
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as MatchRow[];
}

async function getExistingRecapIds(db: SupabaseClient<Database>) {
  const { data, error } = await db
    .from("match_content")
    .select("match_id")
    .eq("content_type", "recap")
    .in("status", [...EXISTING_CONTENT_STATUSES]);

  if (error) {
    throw error;
  }

  return new Set(
    ((data ?? []) as ExistingContentRow[]).map((row) => row.match_id),
  );
}

export async function runFamilyRecapGeneration({
  db,
  dryRun,
  family,
  generateContent,
  limit,
  logger = console,
}: RunDeps): Promise<FamilyRecapGenerationResult> {
  const finishedMatches = await getFinishedMatchesByFamily(db, family);
  const finishedMatchIds = finishedMatches.map((match) => match.id);
  const existingRecapIds = await getExistingRecapIds(db);
  const targetMatchIds = finishedMatchIds.filter(
    (matchId) => !existingRecapIds.has(matchId),
  );
  const limitedTargetMatchIds = targetMatchIds.slice(0, limit);

  logger.log(
    `Family ${family} recap targets: finished=${finishedMatchIds.length} skipped=${finishedMatchIds.length - targetMatchIds.length} targets=${targetMatchIds.length} limit=${limit} generate=${limitedTargetMatchIds.length}`,
  );

  if (dryRun) {
    logger.log("[dry-run] No content generation was executed.");

    return {
      failed: 0,
      generated: 0,
      limit,
      skipped: finishedMatchIds.length - targetMatchIds.length,
      targets: targetMatchIds.length,
      totalFinished: finishedMatchIds.length,
    };
  }

  const result: FamilyRecapGenerationResult = {
    failed: 0,
    generated: 0,
    limit,
    skipped: finishedMatchIds.length - targetMatchIds.length,
    targets: targetMatchIds.length,
    totalFinished: finishedMatchIds.length,
  };

  for (const matchId of limitedTargetMatchIds) {
    try {
      await generateContent(matchId, "recap");
      result.generated += 1;
      logger.log(`Generated recap for ${matchId}`);
    } catch (error) {
      result.failed += 1;
      logger.error(`[generate-recaps] failed for ${matchId}`, error);
    }
  }

  logger.log(`generated=${result.generated} failed=${result.failed}`);

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runFamilyRecapGeneration({
    db: getSupabaseServerClient(),
    dryRun: options.dryRun,
    family: options.family,
    generateContent: (matchId, contentType) =>
      generateMatchContent(matchId, contentType),
    limit: options.limit,
  });
}

if (process.argv[1]?.endsWith("generate-recaps.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
