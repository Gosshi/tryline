import { getSupabaseServerClient } from "@/lib/db/server";
import { fetchNationsChampionship2026KickoffTimes } from "@/lib/ingestion/sources/world-rugby-nations-championship-times";

type CliOptions = {
  apply: boolean;
};

type MatchRow = {
  away_team_id: string;
  home_team_id: string;
  id: string;
  kickoff_at: string;
};

function parseArgs(argv: string[]): CliOptions {
  return {
    apply: argv.includes("--apply"),
  };
}

async function loadCompetitionId() {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("competitions")
    .select("id")
    .eq("slug", "nations-championship-2026")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function loadTeamIds(slugs: string[]) {
  const client = getSupabaseServerClient();
  const uniqueSlugs = [...new Set(slugs)];
  const { data, error } = await client
    .from("teams")
    .select("id, slug")
    .in("slug", uniqueSlugs);

  if (error) {
    throw error;
  }

  const lookup = Object.fromEntries(data.map((team) => [team.slug, team.id]));
  const missing = uniqueSlugs.filter((slug) => !lookup[slug]);

  if (missing.length > 0) {
    throw new Error(`Missing teams for slugs: ${missing.join(", ")}`);
  }

  return lookup;
}

async function loadMatches(competitionId: string): Promise<MatchRow[]> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("matches")
    .select("id, home_team_id, away_team_id, kickoff_at")
    .eq("competition_id", competitionId);

  if (error) {
    throw error;
  }

  return data;
}

async function updateKickoffAt(matchId: string, kickoffAt: string) {
  const client = getSupabaseServerClient();
  const { error } = await client
    .from("matches")
    .update({ kickoff_at: kickoffAt })
    .eq("id", matchId);

  if (error) {
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const kickoffTimes = await fetchNationsChampionship2026KickoffTimes();
  const competitionId = await loadCompetitionId();
  const teamIds = await loadTeamIds(
    kickoffTimes.flatMap((match) => [match.homeTeamSlug, match.awayTeamSlug]),
  );
  const matches = await loadMatches(competitionId);
  const matchByTeams = new Map(
    matches.map((match) => [
      `${match.home_team_id}:${match.away_team_id}`,
      match,
    ]),
  );
  const updates = [];
  const skipped = [];

  for (const kickoffTime of kickoffTimes) {
    const homeTeamId = teamIds[kickoffTime.homeTeamSlug];
    const awayTeamId = teamIds[kickoffTime.awayTeamSlug];
    const match = matchByTeams.get(`${homeTeamId}:${awayTeamId}`);

    if (!match) {
      skipped.push(kickoffTime);
      continue;
    }

    if (match.kickoff_at === kickoffTime.kickoffAt) {
      continue;
    }

    updates.push({
      from: match.kickoff_at,
      matchId: match.id,
      to: kickoffTime.kickoffAt,
    });
  }

  if (options.apply) {
    for (const update of updates) {
      await updateKickoffAt(update.matchId, update.to);
    }
  }

  console.log(
    JSON.stringify(
      {
        applied: options.apply,
        skipped: skipped.length,
        sourceMatches: kickoffTimes.length,
        updates,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
