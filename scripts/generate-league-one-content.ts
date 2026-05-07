import { getSupabaseServerClient } from "@/lib/db/server";
import { generateMatchContent } from "@/lib/llm/pipeline";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type CliOptions = {
  dryRun: boolean;
  season: string;
};

type MatchRow = {
  id: string;
};

type ExistingContentRow = {
  match_id: string;
};

export type LeagueOneContentGenerationResult = {
  failed: number;
  generated: number;
  published: number;
  draft: number;
  skipped: number;
  totalFinished: number;
  targets: number;
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type RunDeps = {
  db: SupabaseClient<Database>;
  dryRun: boolean;
  generateContent: (
    matchId: string,
    contentType: "recap",
  ) => Promise<PipelineResult>;
  logger?: Logger;
  season: string;
};

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;

export function parseArgs(argv: string[]): CliOptions {
  let season: string | null = null;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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
      continue;
    }
  }

  if (!season || !/^\d{4}-\d{2}$/.test(season)) {
    console.error(
      "Usage: generate-league-one-content.ts --season YYYY-YY [--dry-run]",
    );
    process.exit(1);
  }

  return { dryRun, season };
}

async function getCompetitionId(db: SupabaseClient<Database>, season: string) {
  const slug = `league-one-${season}`;
  const { data, error } = await db
    .from("competitions")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(`Competition not found: ${slug}`);
  }

  return data.id;
}

async function getFinishedMatchIds(
  db: SupabaseClient<Database>,
  competitionId: string,
) {
  const { data, error } = await db
    .from("matches")
    .select("id")
    .eq("competition_id", competitionId)
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

  return new Set(((data ?? []) as ExistingContentRow[]).map((row) => row.match_id));
}

export async function runLeagueOneContentGeneration({
  db,
  dryRun,
  generateContent,
  logger = console,
  season,
}: RunDeps): Promise<LeagueOneContentGenerationResult> {
  const competitionId = await getCompetitionId(db, season);
  const finishedMatchIds = await getFinishedMatchIds(db, competitionId);
  const existingRecapIds = await getExistingRecapIds(db, finishedMatchIds);
  const targetMatchIds = finishedMatchIds.filter(
    (matchId) => !existingRecapIds.has(matchId),
  );

  logger.log(
    `League One ${season} recap targets: finished=${finishedMatchIds.length} skipped=${existingRecapIds.size} generate=${targetMatchIds.length}`,
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

  const result: LeagueOneContentGenerationResult = {
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
      logger.log(`Generated recap for ${matchId}: ${generated.status}`);
    } catch (error) {
      result.failed += 1;
      logger.error(`[generate-league-one-content] failed for ${matchId}`, error);
    }
  }

  logger.log(
    `League One ${season} recap generation complete: generated=${result.generated} published=${result.published} draft=${result.draft} skipped=${result.skipped} failed=${result.failed}`,
  );

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runLeagueOneContentGeneration({
    db: getSupabaseServerClient(),
    dryRun: options.dryRun,
    generateContent: (matchId, contentType) =>
      generateMatchContent(matchId, contentType),
    season: options.season,
  });
}

if (process.argv[1]?.endsWith("generate-league-one-content.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
