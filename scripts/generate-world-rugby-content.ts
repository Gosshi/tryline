import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent } from "@/lib/llm/pipeline";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  family: string;
  season: string;
};

type CompetitionRow = {
  id: string;
};

type MatchRow = {
  id: string;
};

type ExistingContentRow = {
  match_id: string;
};

export type WorldRugbyContentGenerationResult = {
  draft: number;
  failed: number;
  generated: number;
  published: number;
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
  logger?: Logger;
  season: string;
};

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;

export function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let family: string | null = null;
  let season: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--family") {
      family = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      family = arg.slice("--family=".length);
      continue;
    }

    if (arg === "--season") {
      season = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--season=")) {
      season = arg.slice("--season=".length);
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  if (!family || !season) {
    console.error(
      "Usage: generate-world-rugby-content.ts --family FAMILY --season YEAR [--dry-run]",
    );
    process.exit(1);
  }

  return { dryRun, family, season };
}

async function getCompetitionIds(
  db: SupabaseClient<Database>,
  family: string,
  season: string,
) {
  const { data, error } = await db
    .from("competitions")
    .select("id")
    .eq("family", family)
    .eq("season", season);

  if (error) {
    throw error;
  }

  const ids = ((data ?? []) as CompetitionRow[]).map(
    (competition) => competition.id,
  );

  if (ids.length === 0) {
    throw new Error(`Competition not found: family=${family} season=${season}`);
  }

  return ids;
}

async function getFinishedMatchIds(
  db: SupabaseClient<Database>,
  competitionIds: string[],
) {
  if (competitionIds.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from("matches")
    .select("id")
    .in("competition_id", competitionIds)
    .eq("status", "finished")
    .order("kickoff_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as MatchRow[]).map((match) => match.id);
}

async function getExistingRecapIds(
  db: SupabaseClient<Database>,
  matchIds: string[],
) {
  if (matchIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await db
    .from("match_content")
    .select("match_id")
    .eq("content_type", "recap")
    .in("status", [...EXISTING_CONTENT_STATUSES])
    .in("match_id", matchIds);

  if (error) {
    throw error;
  }

  return new Set(
    ((data ?? []) as ExistingContentRow[]).map((row) => row.match_id),
  );
}

export async function runWorldRugbyContentGeneration({
  db,
  dryRun,
  family,
  generateContent,
  logger = console,
  season,
}: RunDeps): Promise<WorldRugbyContentGenerationResult> {
  const competitionIds = await getCompetitionIds(db, family, season);
  const finishedMatchIds = await getFinishedMatchIds(db, competitionIds);
  const existingRecapIds = await getExistingRecapIds(db, finishedMatchIds);
  const targetMatchIds = finishedMatchIds.filter(
    (matchId) => !existingRecapIds.has(matchId),
  );

  logger.log(
    `World Rugby ${family} ${season} recap targets: competitions=${competitionIds.length} finished=${finishedMatchIds.length} skipped=${existingRecapIds.size} generate=${targetMatchIds.length}`,
  );

  if (dryRun) {
    logger.log("[dry-run] No content generation was executed.");

    return {
      draft: 0,
      failed: 0,
      generated: 0,
      published: 0,
      skipped: existingRecapIds.size,
      targets: targetMatchIds.length,
      totalFinished: finishedMatchIds.length,
    };
  }

  const result: WorldRugbyContentGenerationResult = {
    draft: 0,
    failed: 0,
    generated: 0,
    published: 0,
    skipped: existingRecapIds.size,
    targets: targetMatchIds.length,
    totalFinished: finishedMatchIds.length,
  };

  for (const matchId of targetMatchIds) {
    try {
      const generated = await generateContent(matchId, "recap");
      result.generated += 1;
      result[generated.status] += 1;
      logger.log(
        `Generated World Rugby recap for ${matchId}: ${generated.status}`,
      );
    } catch (error) {
      result.failed += 1;
      logger.error(
        `[generate-world-rugby-content] failed for ${matchId}`,
        error,
      );
    }
  }

  logger.log(
    `World Rugby ${family} ${season} recap generation complete: generated=${result.generated} published=${result.published} draft=${result.draft} skipped=${result.skipped} failed=${result.failed}`,
  );

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runWorldRugbyContentGeneration({
    db: getSupabaseServerClient(),
    dryRun: options.dryRun,
    family: options.family,
    generateContent: (matchId, contentType) =>
      generateMatchContent(matchId, contentType),
    season: options.season,
  });
}

if (process.argv[1]?.endsWith("generate-world-rugby-content.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
