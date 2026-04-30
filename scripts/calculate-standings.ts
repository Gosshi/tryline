import { getSupabaseServerClient } from "@/lib/db/server";

type CliOptions = {
  slug: string | null;
};

type CompetitionRow = {
  id: string;
  slug: string;
};

type CompetitionTeamRow = {
  team_id: string;
  team: { name: string } | null;
};

type MatchRow = {
  away_score: number | null;
  away_team_id: string;
  home_score: number | null;
  home_team_id: string;
  id: string;
};

type MatchEventRow = {
  match_id: string;
  team_id: string;
};

type TeamStanding = {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  bonusPointsTry: number;
  bonusPointsLosing: number;
  totalPoints: number;
};

function parseOptions(argv: string[]): CliOptions {
  let slug: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--slug") {
      slug = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--slug=")) {
      slug = arg.slice("--slug=".length);
      continue;
    }

    console.error(
      "Usage: pnpm tsx scripts/calculate-standings.ts --slug=six-nations-2025",
    );
    process.exit(1);
  }

  return { slug };
}

function createEmptyStanding(teamId: string, teamName: string): TeamStanding {
  return {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 0,
    played: 0,
    pointsAgainst: 0,
    pointsFor: 0,
    teamId,
    teamName,
    totalPoints: 0,
    triesFor: 0,
    won: 0,
  };
}

function getStanding(
  standings: Map<string, TeamStanding>,
  teamId: string,
): TeamStanding {
  const standing = standings.get(teamId);

  if (!standing) {
    throw new Error(`Missing standings accumulator for team ${teamId}`);
  }

  return standing;
}

function addMatchResult(params: {
  standing: TeamStanding;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
}) {
  const { pointsAgainst, pointsFor, standing, triesFor } = params;
  const scoreDifference = pointsFor - pointsAgainst;

  standing.played += 1;
  standing.pointsFor += pointsFor;
  standing.pointsAgainst += pointsAgainst;
  standing.triesFor += triesFor;

  if (scoreDifference > 0) {
    standing.won += 1;
    standing.totalPoints += 4;
  } else if (scoreDifference === 0) {
    standing.drawn += 1;
    standing.totalPoints += 2;
  } else {
    standing.lost += 1;

    if (Math.abs(scoreDifference) <= 7) {
      standing.bonusPointsLosing += 1;
      standing.totalPoints += 1;
    }
  }

  if (triesFor >= 4) {
    standing.bonusPointsTry += 1;
    standing.totalPoints += 1;
  }
}

async function loadCompetition(slug: string): Promise<CompetitionRow | null> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competitions")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadCompetitionTeams(
  competitionId: string,
): Promise<Map<string, TeamStanding>> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competition_teams")
    .select(
      `
        team_id,
        team:teams!competition_teams_team_id_fkey (
          name
        )
      `,
    )
    .eq("competition_id", competitionId);

  if (error) {
    throw error;
  }

  const standings = new Map<string, TeamStanding>();

  for (const row of (data ?? []) as CompetitionTeamRow[]) {
    standings.set(
      row.team_id,
      createEmptyStanding(row.team_id, row.team?.name ?? row.team_id),
    );
  }

  return standings;
}

async function loadFinishedMatches(competitionId: string): Promise<MatchRow[]> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("matches")
    .select("id, home_team_id, away_team_id, home_score, away_score")
    .eq("competition_id", competitionId)
    .eq("status", "finished");

  if (error) {
    throw error;
  }

  return (data ?? []) as MatchRow[];
}

async function loadTryCounts(
  matchIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const triesByMatchAndTeam = new Map<string, Map<string, number>>();

  if (matchIds.length === 0) {
    return triesByMatchAndTeam;
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_events")
    .select("match_id, team_id")
    .eq("type", "try")
    .in("match_id", matchIds);

  if (error) {
    throw error;
  }

  for (const event of (data ?? []) as MatchEventRow[]) {
    const teamCounts = triesByMatchAndTeam.get(event.match_id) ?? new Map();
    teamCounts.set(event.team_id, (teamCounts.get(event.team_id) ?? 0) + 1);
    triesByMatchAndTeam.set(event.match_id, teamCounts);
  }

  return triesByMatchAndTeam;
}

function calculateRows(params: {
  standings: Map<string, TeamStanding>;
  matches: MatchRow[];
  triesByMatchAndTeam: Map<string, Map<string, number>>;
}) {
  const { matches, standings, triesByMatchAndTeam } = params;

  for (const match of matches) {
    if (match.home_score === null || match.away_score === null) {
      console.warn(`Skipping finished match with missing score: ${match.id}`);
      continue;
    }

    if (!standings.has(match.home_team_id)) {
      standings.set(
        match.home_team_id,
        createEmptyStanding(match.home_team_id, match.home_team_id),
      );
    }

    if (!standings.has(match.away_team_id)) {
      standings.set(
        match.away_team_id,
        createEmptyStanding(match.away_team_id, match.away_team_id),
      );
    }

    const tryCounts = triesByMatchAndTeam.get(match.id);
    const homeTries = tryCounts?.get(match.home_team_id) ?? 0;
    const awayTries = tryCounts?.get(match.away_team_id) ?? 0;

    addMatchResult({
      pointsAgainst: match.away_score,
      pointsFor: match.home_score,
      standing: getStanding(standings, match.home_team_id),
      triesFor: homeTries,
    });
    addMatchResult({
      pointsAgainst: match.home_score,
      pointsFor: match.away_score,
      standing: getStanding(standings, match.away_team_id),
      triesFor: awayTries,
    });
  }

  return [...standings.values()].sort((left, right) => {
    const pointsDifference = right.totalPoints - left.totalPoints;

    if (pointsDifference !== 0) {
      return pointsDifference;
    }

    const leftScoreDifference = left.pointsFor - left.pointsAgainst;
    const rightScoreDifference = right.pointsFor - right.pointsAgainst;
    const scoreDifference = rightScoreDifference - leftScoreDifference;

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return left.teamName.localeCompare(right.teamName);
  });
}

async function upsertRows(competitionId: string, rows: TeamStanding[]) {
  if (rows.length === 0) {
    return { upserted: 0 };
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competition_standings")
    .upsert(
      rows.map((row, index) => ({
        bonus_points_losing: row.bonusPointsLosing,
        bonus_points_try: row.bonusPointsTry,
        competition_id: competitionId,
        drawn: row.drawn,
        lost: row.lost,
        played: row.played,
        points_against: row.pointsAgainst,
        points_for: row.pointsFor,
        position: index + 1,
        team_id: row.teamId,
        total_points: row.totalPoints,
        tries_for: row.triesFor,
        updated_at: new Date().toISOString(),
        won: row.won,
      })),
      { onConflict: "competition_id,team_id" },
    )
    .select("id");

  if (error) {
    throw error;
  }

  return { upserted: data?.length ?? 0 };
}

async function main() {
  const { slug } = parseOptions(process.argv.slice(2));

  if (!slug) {
    console.error(
      "Usage: pnpm tsx scripts/calculate-standings.ts --slug=six-nations-2025",
    );
    process.exit(1);
  }

  const competition = await loadCompetition(slug);

  if (!competition) {
    throw new Error(`Competition not found: ${slug}`);
  }

  const standings = await loadCompetitionTeams(competition.id);
  const matches = await loadFinishedMatches(competition.id);
  const triesByMatchAndTeam = await loadTryCounts(
    matches.map((match) => match.id),
  );
  const rows = calculateRows({ matches, standings, triesByMatchAndTeam });
  const result = await upsertRows(competition.id, rows);

  console.log(
    `Calculated standings for ${competition.slug}: teams=${rows.length} finished_matches=${matches.length} upserted=${result.upserted}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
