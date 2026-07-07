import { getSupabaseServerClient } from "@/lib/db/server";
import { upsertCompetitionStandings } from "@/lib/ingestion/standings";
import { scrapeCompetitionStandings } from "@/lib/scrapers/wikipedia-standings";
import {
  buildResolvedStandingsTeamLookup,
  collectCompetitionTeamIds,
  resolveWikipediaStandingsUrl,
  SUPPORTED_FAMILIES,
  warnUnmatchedStandingsTeams,
  type StandingsTeamRow,
  type SupportedFamily,
} from "@/scripts/backfill-standings";

export type WeeklyStandingsFamilyResult = {
  competitionSlug?: string;
  error?: string;
  family: SupportedFamily;
  matched: number;
  parsed: number;
  reason?: string;
  season?: string;
  sourceUrl?: string;
  status: "failed" | "skipped" | "updated";
  upserted: number;
};

export type WeeklyStandingsIngestionResult = {
  failed: number;
  results: WeeklyStandingsFamilyResult[];
  skipped: number;
  updated: number;
};

type CompetitionRow = {
  id: string;
  season: string;
  slug: string;
};

type MatchTeamIdsDbRow = {
  away_team_id: string;
  home_team_id: string;
};

type TeamDbRow = {
  english_name: string | null;
  id: string;
  name: string;
  slug: string;
};

export const WEEKLY_STANDINGS_FAMILIES: SupportedFamily[] = Array.from(
  SUPPORTED_FAMILIES,
);

async function loadLatestCompetition(
  family: SupportedFamily,
): Promise<CompetitionRow | null> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competitions")
    .select("id, season, slug")
    .eq("family", family)
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data ?? null) as CompetitionRow | null;
}

async function loadStandingsTeamResolutionData(competitionId: string) {
  const db = getSupabaseServerClient();
  const [
    { data: matches, error: matchesError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    db
      .from("matches")
      .select("home_team_id, away_team_id")
      .eq("competition_id", competitionId),
    db.from("teams").select("id, name, english_name, slug"),
  ]);

  if (matchesError) {
    throw matchesError;
  }

  if (teamsError) {
    throw teamsError;
  }

  return {
    competitionTeamIds: collectCompetitionTeamIds(
      (matches ?? []) as MatchTeamIdsDbRow[],
    ),
    teams: ((teams ?? []) as TeamDbRow[]).map((team): StandingsTeamRow => ({
      englishName: team.english_name,
      id: team.id,
      name: team.name,
      slug: team.slug,
    })),
  };
}

export async function ingestStandingsForFamily(
  family: SupportedFamily,
): Promise<WeeklyStandingsFamilyResult> {
  const competition = await loadLatestCompetition(family);

  if (!competition) {
    return {
      family,
      matched: 0,
      parsed: 0,
      reason: "competition_not_found",
      status: "skipped",
      upserted: 0,
    };
  }

  const sourceUrl = resolveWikipediaStandingsUrl(family, competition.season);
  const rows = await scrapeCompetitionStandings(sourceUrl);

  if (rows.length === 0) {
    return {
      competitionSlug: competition.slug,
      family,
      matched: 0,
      parsed: 0,
      reason: "no_rows_parsed",
      season: competition.season,
      sourceUrl,
      status: "skipped",
      upserted: 0,
    };
  }

  const { competitionTeamIds, teams } = await loadStandingsTeamResolutionData(
    competition.id,
  );
  const teamLookup = buildResolvedStandingsTeamLookup(
    rows,
    teams,
    competitionTeamIds,
  );
  const matched = rows.filter((row) => teamLookup[row.teamName]).length;

  warnUnmatchedStandingsTeams(rows, teamLookup);

  if (matched === 0) {
    return {
      competitionSlug: competition.slug,
      family,
      matched,
      parsed: rows.length,
      reason: "no_teams_matched",
      season: competition.season,
      sourceUrl,
      status: "skipped",
      upserted: 0,
    };
  }

  const result = await upsertCompetitionStandings({
    competitionId: competition.id,
    rows,
    teamLookup,
  });

  return {
    competitionSlug: competition.slug,
    family,
    matched,
    parsed: rows.length,
    season: competition.season,
    sourceUrl,
    status: "updated",
    upserted: result.upserted,
  };
}

export async function ingestWeeklyStandings(): Promise<WeeklyStandingsIngestionResult> {
  const results: WeeklyStandingsFamilyResult[] = [];

  for (const family of WEEKLY_STANDINGS_FAMILIES) {
    try {
      results.push(await ingestStandingsForFamily(family));
    } catch (error) {
      console.error("Failed to ingest competition standings.", {
        error,
        family,
      });
      results.push({
        error: error instanceof Error ? error.message : "Unknown error",
        family,
        matched: 0,
        parsed: 0,
        status: "failed",
        upserted: 0,
      });
    }
  }

  return {
    failed: results.filter((result) => result.status === "failed").length,
    results,
    skipped: results.filter((result) => result.status === "skipped").length,
    updated: results.reduce((total, result) => total + result.upserted, 0),
  };
}
