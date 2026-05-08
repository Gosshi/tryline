import {
  runWorldRugbyFullImport,
  type WorldRugbyFullImportResult,
} from "@/scripts/import-world-rugby-full";

import type { WorldRugbyCompetitionFamily } from "@/lib/scrapers/world-rugby-schedule";

type CliOptions = {
  dryRun: boolean;
  families: WorldRugbyCompetitionFamily[];
  fromYear: number;
  toYear: number;
};

type SeasonTask = {
  competitionId: string | null;
  family: WorldRugbyCompetitionFamily;
  season: string;
};

type SeasonResult = {
  competitionId: string | null;
  error: string | null;
  family: WorldRugbyCompetitionFamily;
  result: WorldRugbyFullImportResult | null;
  season: string;
  skipped: boolean;
};

export type WorldRugbyHistoricalImportResult = {
  failedSeasons: number;
  seasons: SeasonResult[];
  skippedSeasons: number;
  successfulSeasons: number;
};

type Logger = Pick<Console, "error" | "log" | "warn">;

type RunDeps = {
  dryRun: boolean;
  families: WorldRugbyCompetitionFamily[];
  fromYear: number;
  importSeason?: (task: {
    competitionId: string;
    family: WorldRugbyCompetitionFamily;
    season: string;
  }) => Promise<WorldRugbyFullImportResult>;
  logger?: Logger;
  sleepMs?: number;
  toYear: number;
};

const ALL_FAMILIES: WorldRugbyCompetitionFamily[] = ["pnc", "autumn-nations"];
const DEFAULT_FROM_YEAR = 2020;
const DEFAULT_TO_YEAR = 2025;
const SEASON_SLEEP_MS = 5_000;

export const COMPETITION_ID_MAP: Record<
  WorldRugbyCompetitionFamily,
  Record<string, string>
> = {
  "autumn-nations": {
    // 2020: ID 2009 は PNC 大会のため除外
    "2021": "2050",
    "2022": "2091",
    "2024": "c805a102-6cbe-4eed-a158-f5878cf1f162",
    "2025": "03cdc8d6-d13d-4e47-962e-3c0663306cb3",
  },
  pnc: {
    "2022": "2104",
    "2024": "735a21a5-9069-4fad-810e-81806f9c47a4",
    "2025": "0c6a4bb9-4cf9-4960-a587-0022dd2985a4",
  },
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseFamily(value: string | null | undefined) {
  if (value !== "pnc" && value !== "autumn-nations") {
    console.error("--family must be pnc or autumn-nations");
    process.exit(1);
  }

  return value;
}

function parseYear(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);

  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
    console.error("--from and --to must be valid years");
    process.exit(1);
  }

  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let families = ALL_FAMILIES;
  let fromYear = DEFAULT_FROM_YEAR;
  let toYear = DEFAULT_TO_YEAR;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--family") {
      families = [parseFamily(argv[index + 1])];
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      families = [parseFamily(arg.slice("--family=".length))];
      continue;
    }

    if (arg === "--from") {
      fromYear = parseYear(argv[index + 1], DEFAULT_FROM_YEAR);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--from=")) {
      fromYear = parseYear(arg.slice("--from=".length), DEFAULT_FROM_YEAR);
      continue;
    }

    if (arg === "--to") {
      toYear = parseYear(argv[index + 1], DEFAULT_TO_YEAR);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--to=")) {
      toYear = parseYear(arg.slice("--to=".length), DEFAULT_TO_YEAR);
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  if (fromYear > toYear) {
    console.error("--from must be less than or equal to --to");
    process.exit(1);
  }

  return { dryRun, families, fromYear, toYear };
}

export function buildSeasonTasks(params: {
  families: WorldRugbyCompetitionFamily[];
  fromYear: number;
  toYear: number;
}): SeasonTask[] {
  const tasks: SeasonTask[] = [];

  for (const family of params.families) {
    for (let year = params.fromYear; year <= params.toYear; year += 1) {
      const season = String(year);

      tasks.push({
        competitionId: COMPETITION_ID_MAP[family][season] ?? null,
        family,
        season,
      });
    }
  }

  return tasks;
}

function createSkippedResult(task: SeasonTask): SeasonResult {
  return {
    competitionId: null,
    error: null,
    family: task.family,
    result: null,
    season: task.season,
    skipped: true,
  };
}

function createFailedResult(task: SeasonTask, error: unknown): SeasonResult {
  return {
    competitionId: task.competitionId,
    error: error instanceof Error ? error.message : String(error),
    family: task.family,
    result: null,
    season: task.season,
    skipped: false,
  };
}

export async function runWorldRugbyHistoricalImport({
  dryRun,
  families,
  fromYear,
  importSeason = (task) => runWorldRugbyFullImport(task),
  logger = console,
  sleepMs = SEASON_SLEEP_MS,
  toYear,
}: RunDeps): Promise<WorldRugbyHistoricalImportResult> {
  const tasks = buildSeasonTasks({ families, fromYear, toYear });
  const results: SeasonResult[] = [];

  for (const task of tasks) {
    if (!task.competitionId) {
      logger.log(`[skip] ${task.family}/${task.season}: no competition ID`);
      results.push(createSkippedResult(task));
      continue;
    }

    logger.log(`[target] ${task.family}/${task.season}: ${task.competitionId}`);

    if (dryRun) {
      continue;
    }

    try {
      const result = await importSeason({
        competitionId: task.competitionId,
        family: task.family,
        season: task.season,
      });

      results.push({
        competitionId: task.competitionId,
        error: null,
        family: task.family,
        result,
        season: task.season,
        skipped: false,
      });
    } catch (error) {
      logger.error(
        `[import-world-rugby-historical] failed ${task.family}/${task.season}`,
        error,
      );
      results.push(createFailedResult(task, error));
    }

    await sleep(sleepMs);
  }

  const successfulSeasons = results.filter(
    (result) => !result.skipped && result.result,
  ).length;
  const skippedSeasons = results.filter((result) => result.skipped).length;
  const failedSeasons = results.filter((result) => result.error).length;

  logger.log(
    `World Rugby historical import complete: success=${successfulSeasons} skipped=${skippedSeasons} failed=${failedSeasons}`,
  );

  return {
    failedSeasons,
    seasons: results,
    skippedSeasons,
    successfulSeasons,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runWorldRugbyHistoricalImport(options);
}

if (process.argv[1]?.endsWith("import-world-rugby-historical.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
