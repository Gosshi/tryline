import { getSupabaseServerClient } from "@/lib/db/server";

import type { AssembledContentInput } from "@/lib/llm/types";

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export async function assembleMatchContentInput(matchId: string): Promise<AssembledContentInput> {
  const db = getSupabaseServerClient();

  const { data: match, error: matchError } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        venue,
        competition:competitions(id, name, season),
        home_team:teams!matches_home_team_id_fkey(id, name, short_code, country),
        away_team:teams!matches_away_team_id_fkey(id, name, short_code, country)
      `,
    )
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    throw new Error(`match ${matchId} not found`);
  }

  const homeTeamId = match.home_team?.id;
  const awayTeamId = match.away_team?.id;

  if (!homeTeamId || !awayTeamId) {
    throw new Error("match is missing team references");
  }

  const { data: recentMatches, error: recentError } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        home_team_id,
        away_team_id
      `,
    )
    .lt("kickoff_at", match.kickoff_at)
    .in("status", ["finished"])
    .or(`home_team_id.eq.${homeTeamId},away_team_id.eq.${homeTeamId},home_team_id.eq.${awayTeamId},away_team_id.eq.${awayTeamId}`)
    .order("kickoff_at", { ascending: false })
    .limit(20);

  if (recentError) {
    throw recentError;
  }

  const homeRecent = (recentMatches ?? [])
    .filter((item) => item.home_team_id === homeTeamId || item.away_team_id === homeTeamId)
    .slice(0, 5)
    .map((item) => ({
      match_id: item.id,
      kickoff_at: item.kickoff_at,
      home_team_name: item.home_team?.name ?? "",
      away_team_name: item.away_team?.name ?? "",
      home_score: item.home_score,
      away_score: item.away_score,
      status: item.status,
    }));

  const awayRecent = (recentMatches ?? [])
    .filter((item) => item.home_team_id === awayTeamId || item.away_team_id === awayTeamId)
    .slice(0, 5)
    .map((item) => ({
      match_id: item.id,
      kickoff_at: item.kickoff_at,
      home_team_name: item.home_team?.name ?? "",
      away_team_name: item.away_team?.name ?? "",
      home_score: item.home_score,
      away_score: item.away_score,
      status: item.status,
    }));

  const h2hLast5 = (recentMatches ?? [])
    .filter(
      (item) =>
        (item.home_team_id === homeTeamId && item.away_team_id === awayTeamId) ||
        (item.home_team_id === awayTeamId && item.away_team_id === homeTeamId),
    )
    .slice(0, 5)
    .map((item) => ({
      match_id: item.id,
      kickoff_at: item.kickoff_at,
      home_team_name: item.home_team?.name ?? "",
      away_team_name: item.away_team?.name ?? "",
      home_score: item.home_score,
      away_score: item.away_score,
      status: item.status,
    }));

  const homeFor = homeRecent
    .map((item) => {
      if (item.home_team_name === match.home_team?.name) return item.home_score;
      if (item.away_team_name === match.home_team?.name) return item.away_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const homeAgainst = homeRecent
    .map((item) => {
      if (item.home_team_name === match.home_team?.name) return item.away_score;
      if (item.away_team_name === match.home_team?.name) return item.home_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const awayFor = awayRecent
    .map((item) => {
      if (item.home_team_name === match.away_team?.name) return item.home_score;
      if (item.away_team_name === match.away_team?.name) return item.away_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const awayAgainst = awayRecent
    .map((item) => {
      if (item.home_team_name === match.away_team?.name) return item.away_score;
      if (item.away_team_name === match.away_team?.name) return item.home_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  return {
    match: {
      id: match.id,
      kickoff_at: match.kickoff_at,
      status: match.status,
      venue: match.venue,
      competition: match.competition,
      home_team: match.home_team,
      away_team: match.away_team,
    },
    recent_form: {
      home: homeRecent,
      away: awayRecent,
    },
    h2h_last_5: h2hLast5,
    projected_lineups: {
      home: [],
      away: [],
    },
    injuries: {
      home: [],
      away: [],
    },
    key_stats: {
      home: {
        avg_points_for_last_5: average(homeFor),
        avg_points_against_last_5: average(homeAgainst),
      },
      away: {
        avg_points_for_last_5: average(awayFor),
        avg_points_against_last_5: average(awayAgainst),
      },
    },
  };
}
