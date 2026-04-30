import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseWikipediaSixNationsHtml } from "@/lib/ingestion/sources/wikipedia-six-nations";
import { fetchWithPolicy } from "@/lib/scrapers/fetcher";

type SupportedYear = keyof typeof YEAR_CONFIG;

type HistoricalMatchResult = {
  season: number;
  round: number | null;
  kickoff_at: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  source_url: string;
  wikipedia_event_id: string | null;
};

const YEAR_CONFIG = {
  2025: {
    url: "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship",
  },
  2026: {
    url: "https://en.wikipedia.org/wiki/2026_Six_Nations_Championship",
  },
} as const;

const TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  England: "england",
  France: "france",
  Ireland: "ireland",
  Italy: "italy",
  Scotland: "scotland",
  Wales: "wales",
};

function parseYearArg(value: string | undefined): SupportedYear {
  if (value === "2025" || value === "2026") {
    return Number(value) as SupportedYear;
  }

  console.error(
    "Usage: pnpm tsx scripts/extract-six-nations-wikipedia.ts <2025|2026>",
  );
  process.exit(1);
}

function resolveTeamSlug(teamName: string) {
  const slug = TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    console.error(`Unknown Six Nations team name from Wikipedia: ${teamName}`);
    process.exit(1);
  }

  return slug;
}

async function main() {
  const year = parseYearArg(process.argv[2]);
  const sourceUrl = YEAR_CONFIG[year].url;
  const response = await fetchWithPolicy(sourceUrl);
  const html = await response.text();
  const parsedMatches = parseWikipediaSixNationsHtml(html);

  if (parsedMatches.length !== 15) {
    console.error(
      `Expected 15 Six Nations ${year} matches, got ${parsedMatches.length}.`,
    );
    process.exit(1);
  }

  const results: HistoricalMatchResult[] = parsedMatches.map((match) => {
    if (match.homeScore === null || match.awayScore === null) {
      console.error(
        `Missing score for Six Nations ${year}: ${match.homeTeamName} vs ${match.awayTeamName}`,
      );
      process.exit(1);
    }

    return {
      away_score: match.awayScore,
      away_team_slug: resolveTeamSlug(match.awayTeamName),
      home_score: match.homeScore,
      home_team_slug: resolveTeamSlug(match.homeTeamName),
      kickoff_at: match.kickoffAt,
      round: match.round,
      season: year,
      source_url: sourceUrl,
      venue: match.venue,
      wikipedia_event_id: match.eventId,
    };
  });

  const outputDir = path.join(process.cwd(), "data", "six-nations");
  const outputPath = path.join(outputDir, `${year}-results.json`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");

  console.log(`Extracted ${results.length} matches for Six Nations ${year}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
