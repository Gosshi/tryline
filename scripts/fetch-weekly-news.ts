import { fetchWeeklyNews } from "@/lib/llm/weekly-news/fetch";

type CliOptions = {
  weekFrom?: string;
};

const USAGE = "Usage: fetch-weekly-news.ts [--week-from YYYY-MM-DD]";

export function parseArgs(argv: string[]): CliOptions {
  let weekFrom: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--week-from") {
      weekFrom = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg?.startsWith("--week-from=")) {
      weekFrom = arg.slice("--week-from=".length);
      continue;
    }

    throw new Error(USAGE);
  }

  if (weekFrom && !/^\d{4}-\d{2}-\d{2}$/.test(weekFrom)) {
    throw new Error(USAGE);
  }

  return { weekFrom };
}

export async function runWeeklyNewsFetch(options: CliOptions) {
  return fetchWeeklyNews({ weekFrom: options.weekFrom });
}

if (require.main === module) {
  runWeeklyNewsFetch(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(
        `Weekly news fetch completed: week=${result.week.from}..${result.week.to} drafts=${result.items.length}`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
