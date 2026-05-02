import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";

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

type TeamLookup = Record<string, string>;

const YEAR_CONFIG = {
  2020: {
    endDate: "2020-10-31",
    page: "2020_Six_Nations_Championship",
    startDate: "2020-02-01",
  },
  2021: {
    endDate: "2021-10-30",
    page: "2021_Six_Nations_Championship",
    startDate: "2021-02-06",
  },
  2022: {
    endDate: "2022-03-19",
    page: "2022_Six_Nations_Championship",
    startDate: "2022-02-05",
  },
  2023: {
    endDate: "2023-03-18",
    page: "2023_Six_Nations_Championship",
    startDate: "2023-02-04",
  },
  2024: {
    endDate: "2024-03-16",
    page: "2024_Six_Nations_Championship",
    startDate: "2024-02-02",
  },
  2025: {
    endDate: "2025-03-15",
    page: "2025_Six_Nations_Championship",
    startDate: "2025-01-31",
  },
  2026: {
    endDate: "2026-03-14",
    page: "2026_Six_Nations_Championship",
    startDate: "2026-02-05",
  },
} as const;

function parseYearArg(value: string | undefined): SupportedYear {
  if (
    value === "2020" ||
    value === "2021" ||
    value === "2022" ||
    value === "2023" ||
    value === "2024" ||
    value === "2025" ||
    value === "2026"
  ) {
    return Number(value) as SupportedYear;
  }

  console.error(
    "Usage: pnpm tsx scripts/import-six-nations-results.ts <2020|2021|2022|2023|2024|2025|2026>",
  );
  process.exit(1);
}

function isHistoricalMatchResult(
  value: unknown,
): value is HistoricalMatchResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.season === "number" &&
    (typeof record.round === "number" || record.round === null) &&
    typeof record.kickoff_at === "string" &&
    typeof record.home_team_slug === "string" &&
    typeof record.away_team_slug === "string" &&
    typeof record.home_score === "number" &&
    typeof record.away_score === "number" &&
    (typeof record.venue === "string" || record.venue === null) &&
    typeof record.source_url === "string" &&
    (typeof record.wikipedia_event_id === "string" ||
      record.wikipedia_event_id === null)
  );
}

async function readResults(year: SupportedYear) {
  const inputPath = path.join(
    process.cwd(),
    "data",
    "six-nations",
    `${year}-results.json`,
  );
  const raw = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed) || parsed.length !== 15) {
    console.error(`Expected 15 records in ${inputPath}.`);
    process.exit(1);
  }

  if (!parsed.every(isHistoricalMatchResult)) {
    console.error(`Invalid historical result JSON shape: ${inputPath}`);
    process.exit(1);
  }

  return parsed;
}

async function upsertCompetition(year: SupportedYear) {
  const client = getSupabaseServerClient();
  const config = YEAR_CONFIG[year];
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: config.endDate,
        family: "six-nations",
        name: `Six Nations ${year}`,
        season: String(year),
        slug: `six-nations-${year}`,
        start_date: config.startDate,
      },
      {
        onConflict: "slug",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function getTeamLookup(teamSlugs: string[]): Promise<TeamLookup> {
  const client = getSupabaseServerClient();
  const uniqueSlugs = [...new Set(teamSlugs)];
  const { data, error } = await client
    .from("teams")
    .select("id, slug")
    .in("slug", uniqueSlugs);

  if (error) {
    throw error;
  }

  const lookup = Object.fromEntries(data.map((team) => [team.slug, team.id]));
  const missingSlugs = uniqueSlugs.filter((slug) => !lookup[slug]);

  if (missingSlugs.length > 0) {
    console.error(`Unknown team slug(s): ${missingSlugs.join(", ")}`);
    process.exit(1);
  }

  return lookup;
}

function buildExternalIds(
  result: HistoricalMatchResult,
  year: SupportedYear,
): Record<string, Json> {
  return {
    source: "wikipedia",
    wikipedia_event_id: result.wikipedia_event_id,
    wikipedia_page: YEAR_CONFIG[year].page,
    wikipedia_round: result.round,
    wikipedia_url: result.source_url,
  };
}

async function upsertMatches(
  results: HistoricalMatchResult[],
  competitionId: string,
  teamLookup: TeamLookup,
  year: SupportedYear,
) {
  const client = getSupabaseServerClient();
  const rows = results.map((result) => {
    const homeTeamId = teamLookup[result.home_team_slug];
    const awayTeamId = teamLookup[result.away_team_slug];

    if (!homeTeamId || !awayTeamId) {
      console.error(
        `Unable to resolve team ids for ${result.home_team_slug} vs ${result.away_team_slug}`,
      );
      process.exit(1);
    }

    return {
      away_score: result.away_score,
      away_team_id: awayTeamId,
      competition_id: competitionId,
      external_ids: buildExternalIds(result, year),
      home_score: result.home_score,
      home_team_id: homeTeamId,
      kickoff_at: result.kickoff_at,
      status: "finished",
      venue: result.venue,
    };
  });

  const { data, error } = await client
    .from("matches")
    .upsert(rows, {
      onConflict: "competition_id,home_team_id,away_team_id,kickoff_at",
    })
    .select("id");

  if (error) {
    throw error;
  }

  return data.length;
}

async function upsertCompetitionTeams(
  competitionId: string,
  teamLookup: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = Object.values(teamLookup).map((teamId) => ({
    competition_id: competitionId,
    team_id: teamId,
  }));
  const { error } = await client
    .from("competition_teams")
    .upsert(rows, { onConflict: "competition_id,team_id" });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function main() {
  const year = parseYearArg(process.argv[2]);
  const results = await readResults(year);
  const competitionId = await upsertCompetition(year);
  const teamLookup = await getTeamLookup(
    results.flatMap((result) => [result.home_team_slug, result.away_team_slug]),
  );
  const upsertedCount = await upsertMatches(
    results,
    competitionId,
    teamLookup,
    year,
  );
  const teamCount = await upsertCompetitionTeams(competitionId, teamLookup);

  console.log(
    `Upserted ${upsertedCount} matches and ${teamCount} competition_teams for Six Nations ${year}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
