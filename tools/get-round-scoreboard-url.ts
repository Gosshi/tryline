import { createRoundScoreboardOgImage } from "@/lib/seo/og-image";

const USAGE =
  "Usage: pnpm tsx tools/get-round-scoreboard-url.ts --competition-id=<uuid> --round=<number> [--competition=<label>] [--site-url=<url>]";

type Options = {
  competitionId: string;
  competitionLabel?: string;
  round: number;
  siteUrl?: string;
};

function parseOptions(argv: string[]): Options {
  let competitionId: string | null = null;
  let competitionLabel: string | undefined;
  let round: number | null = null;
  let siteUrl: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--competition-id=")) {
      competitionId = arg.slice("--competition-id=".length);
      continue;
    }

    if (arg.startsWith("--competition=")) {
      competitionLabel = arg.slice("--competition=".length);
      continue;
    }

    if (arg.startsWith("--round=")) {
      const value = Number(arg.slice("--round=".length));
      round = Number.isInteger(value) && value >= 0 ? value : null;
      continue;
    }

    if (arg.startsWith("--site-url=")) {
      siteUrl = arg.slice("--site-url=".length).replace(/\/+$/, "");
      continue;
    }

    throw new Error(USAGE);
  }

  if (!competitionId || round === null) {
    throw new Error(USAGE);
  }

  return {
    competitionId,
    competitionLabel,
    round,
    siteUrl,
  };
}

export function buildRoundScoreboardUrlFromCliArgs(argv: string[]) {
  const options = parseOptions(argv);
  const image = createRoundScoreboardOgImage({
    competitionId: options.competitionId,
    competitionLabel: options.competitionLabel,
    round: options.round,
  });

  return options.siteUrl
    ? new URL(image.url, options.siteUrl).toString()
    : image.url;
}

if (process.argv[1]?.endsWith("get-round-scoreboard-url.ts")) {
  try {
    console.log(buildRoundScoreboardUrlFromCliArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
