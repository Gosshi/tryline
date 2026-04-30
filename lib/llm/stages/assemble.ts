import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";
import type { AssembledContentInput } from "@/lib/llm/types";

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function asJsonObject(value: Json): Record<string, Json> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, Json>;
}

async function loadProjectedLineup(
  matchId: string,
  teamId: string,
): Promise<AssembledContentInput["projected_lineups"]["home"]> {
  const db = getSupabaseServerClient();

  const { data: matchLineups, error: lineupsError } = await db
    .from("match_lineups")
    .select("jersey_number, is_starter, player:players(name, position)")
    .eq("match_id", matchId)
    .eq("team_id", teamId)
    .order("jersey_number", { ascending: true });

  if (lineupsError) {
    throw lineupsError;
  }

  if ((matchLineups ?? []).length > 0) {
    return matchLineups.map((item) => ({
      name: item.player?.name ?? "",
      position: item.player?.position ?? null,
      jersey_number: item.jersey_number,
      is_starter: item.is_starter,
    }));
  }

  const { data: players, error: playersError } = await db
    .from("players")
    .select("name, position, caps")
    .eq("team_id", teamId)
    .order("caps", { ascending: false, nullsFirst: false });

  if (playersError) {
    throw playersError;
  }

  return (players ?? []).map((player) => ({
    name: player.name,
    position: player.position,
    jersey_number: null,
    is_starter: null,
  }));
}

async function loadCompetitionStandings(
  competitionId: string | undefined,
): Promise<AssembledContentInput["competition_standings"]> {
  if (!competitionId) {
    return [];
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("competition_standings")
    .select(
      `
        position,
        played,
        won,
        drawn,
        lost,
        points_for,
        points_against,
        tries_for,
        bonus_points_try,
        bonus_points_losing,
        total_points,
        team:teams(name)
      `,
    )
    .eq("competition_id", competitionId)
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    bonus_points_losing: row.bonus_points_losing,
    bonus_points_try: row.bonus_points_try,
    drawn: row.drawn,
    lost: row.lost,
    played: row.played,
    points_against: row.points_against,
    points_for: row.points_for,
    position: row.position,
    team_name: row.team?.name ?? "",
    total_points: row.total_points,
    tries_for: row.tries_for,
    won: row.won,
  }));
}

async function loadMatchEvents(
  matchId: string,
  status: string,
): Promise<AssembledContentInput["match_events"]> {
  if (status !== "finished") {
    return [];
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_events")
    .select("type, minute, metadata, team:teams(name)")
    .eq("match_id", matchId)
    .order("minute", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((event) => {
    const metadata = asJsonObject(event.metadata);
    const playerName = metadata.player_name;
    const isPenaltyTry = metadata.is_penalty_try;

    return {
      ...(isPenaltyTry === true ? { is_penalty_try: true } : {}),
      minute: event.minute,
      player_name: typeof playerName === "string" ? playerName : "",
      team_name: event.team?.name ?? "",
      type: event.type,
    };
  });
}

export async function assembleMatchContentInput(
  matchId: string,
): Promise<AssembledContentInput> {
  const db = getSupabaseServerClient();

  const { data: match, error: matchError } = await db
    .from("matches")
    .select(
      `
        id,
        competition_id,
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
    .or(
      `home_team_id.eq.${homeTeamId},away_team_id.eq.${homeTeamId},home_team_id.eq.${awayTeamId},away_team_id.eq.${awayTeamId}`,
    )
    .order("kickoff_at", { ascending: false })
    .limit(20);

  if (recentError) {
    throw recentError;
  }

  const homeRecent = (recentMatches ?? [])
    .filter(
      (item) =>
        item.home_team_id === homeTeamId || item.away_team_id === homeTeamId,
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

  const awayRecent = (recentMatches ?? [])
    .filter(
      (item) =>
        item.home_team_id === awayTeamId || item.away_team_id === awayTeamId,
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

  const h2hLast5 = (recentMatches ?? [])
    .filter(
      (item) =>
        (item.home_team_id === homeTeamId &&
          item.away_team_id === awayTeamId) ||
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

  const [
    homeProjectedLineups,
    awayProjectedLineups,
    competitionStandings,
    matchEvents,
  ] =
    await Promise.all([
      loadProjectedLineup(matchId, homeTeamId),
      loadProjectedLineup(matchId, awayTeamId),
      loadCompetitionStandings(match.competition_id),
      loadMatchEvents(matchId, match.status),
    ]);

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
    match_events: matchEvents,
    competition_standings: competitionStandings,
    projected_lineups: {
      home: homeProjectedLineups,
      away: awayProjectedLineups,
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
