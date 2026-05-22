import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";
import type {
  AssembledContentInput,
  ContentLanguage,
  MatchPhase,
} from "@/lib/llm/types";

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function computeTeamFormStats(
  recent: Array<{
    home_team_name: string;
    away_team_name: string;
    home_score: number | null;
    away_score: number | null;
  }>,
  teamName: string,
): {
  win_rate_last_5: number | null;
  avg_score_diff_last_5: number | null;
  result_streak: "winning" | "losing" | "mixed" | null;
} {
  if (recent.length === 0) {
    return {
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    };
  }

  type Result = "win" | "loss" | "draw";
  const results: Result[] = [];
  const diffs: number[] = [];

  for (const match of recent) {
    const isHome = match.home_team_name === teamName;
    const isAway = match.away_team_name === teamName;
    if (!isHome && !isAway) {
      continue;
    }

    const scored = isHome ? match.home_score : match.away_score;
    const conceded = isHome ? match.away_score : match.home_score;

    if (scored === null || conceded === null) {
      continue;
    }

    diffs.push(scored - conceded);
    if (scored > conceded) {
      results.push("win");
    } else if (scored < conceded) {
      results.push("loss");
    } else {
      results.push("draw");
    }
  }

  if (results.length === 0) {
    return {
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    };
  }

  const wins = results.filter((result) => result === "win").length;
  const winRateLast5 = Number((wins / results.length).toFixed(2));
  const avgScoreDiffLast5 = average(diffs);
  const allWins = results.every((result) => result === "win");
  const allLosses = results.every((result) => result === "loss");
  const resultStreak: "winning" | "losing" | "mixed" = allWins
    ? "winning"
    : allLosses
      ? "losing"
      : "mixed";

  return {
    avg_score_diff_last_5: avgScoreDiffLast5,
    result_streak: resultStreak,
    win_rate_last_5: winRateLast5,
  };
}

function computeMatchStats(
  events: AssembledContentInput["match_events"],
  homeTeamName: string,
  awayTeamName: string,
): AssembledContentInput["key_stats"]["match"] {
  let homePenalties = 0;
  let awayPenalties = 0;
  let homeTries = 0;
  let awayTries = 0;
  let lateScoring = false;

  for (const event of events) {
    const isHome = event.team_name === homeTeamName;
    const isAway = event.team_name === awayTeamName;

    if (event.type === "penalty") {
      if (isHome) {
        homePenalties += 1;
      } else if (isAway) {
        awayPenalties += 1;
      }
    }

    if (event.type === "try") {
      if (isHome) {
        homeTries += 1;
      } else if (isAway) {
        awayTries += 1;
      }
    }

    if (event.minute !== null && event.minute >= 70) {
      lateScoring = true;
    }
  }

  return {
    late_scoring: lateScoring,
    penalty_count: { away: awayPenalties, home: homePenalties },
    try_count: { away: awayTries, home: homeTries },
  };
}

function asJsonObject(value: Json): Record<string, Json> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, Json>;
}

function resolveTeamName(
  name: string,
  englishName: string | null,
  language: ContentLanguage,
): string {
  return language === "en" && englishName ? englishName : name;
}

function deriveMatchPhase(externalIds: unknown): MatchPhase | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const ids = externalIds as Record<string, unknown>;
  const roundName =
    typeof ids.round_name === "string" ? ids.round_name.toLowerCase() : null;
  const round =
    typeof ids.wikipedia_round === "number" ? ids.wikipedia_round : null;

  if (round !== null) {
    return "league";
  }

  if (!roundName) {
    return null;
  }

  if (
    roundName.includes("final") &&
    !roundName.includes("semi") &&
    !roundName.includes("quarter")
  ) {
    return "playoff_final";
  }

  if (roundName.includes("semi")) {
    return "playoff_semifinal";
  }

  return "playoff_other";
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
  language: ContentLanguage,
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
        team:teams(name, english_name)
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
    team_name: row.team
      ? resolveTeamName(row.team.name, row.team.english_name, language)
      : "",
    total_points: row.total_points,
    tries_for: row.tries_for,
    won: row.won,
  }));
}

async function loadMatchEvents(
  matchId: string,
  status: string,
  language: ContentLanguage,
): Promise<AssembledContentInput["match_events"]> {
  if (status !== "finished") {
    return [];
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_events")
    .select("type, minute, metadata, team:teams(name, english_name)")
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
      team_name: event.team
        ? resolveTeamName(event.team.name, event.team.english_name, language)
        : "",
      type: event.type,
    };
  });
}

export async function assembleMatchContentInput(
  matchId: string,
  language: ContentLanguage = "ja",
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
        home_score,
        away_score,
        external_ids,
        competition:competitions(id, name, season, family),
        home_team:teams!matches_home_team_id_fkey(id, name, english_name, short_code, country),
        away_team:teams!matches_away_team_id_fkey(id, name, english_name, short_code, country)
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

  const homeTeamName = match.home_team
    ? resolveTeamName(
        match.home_team.name,
        match.home_team.english_name,
        language,
      )
    : "";
  const awayTeamName = match.away_team
    ? resolveTeamName(
        match.away_team.name,
        match.away_team.english_name,
        language,
      )
    : "";

  const { data: recentMatches, error: recentError } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        home_score,
        away_score,
        home_team:teams!matches_home_team_id_fkey(name, english_name),
        away_team:teams!matches_away_team_id_fkey(name, english_name),
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
      home_team_name: item.home_team
        ? resolveTeamName(
            item.home_team.name,
            item.home_team.english_name,
            language,
          )
        : "",
      away_team_name: item.away_team
        ? resolveTeamName(
            item.away_team.name,
            item.away_team.english_name,
            language,
          )
        : "",
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
      home_team_name: item.home_team
        ? resolveTeamName(
            item.home_team.name,
            item.home_team.english_name,
            language,
          )
        : "",
      away_team_name: item.away_team
        ? resolveTeamName(
            item.away_team.name,
            item.away_team.english_name,
            language,
          )
        : "",
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
      home_team_name: item.home_team
        ? resolveTeamName(
            item.home_team.name,
            item.home_team.english_name,
            language,
          )
        : "",
      away_team_name: item.away_team
        ? resolveTeamName(
            item.away_team.name,
            item.away_team.english_name,
            language,
          )
        : "",
      home_score: item.home_score,
      away_score: item.away_score,
      status: item.status,
    }));

  const homeFor = homeRecent
    .map((item) => {
      if (item.home_team_name === homeTeamName) return item.home_score;
      if (item.away_team_name === homeTeamName) return item.away_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const homeAgainst = homeRecent
    .map((item) => {
      if (item.home_team_name === homeTeamName) return item.away_score;
      if (item.away_team_name === homeTeamName) return item.home_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const awayFor = awayRecent
    .map((item) => {
      if (item.home_team_name === awayTeamName) return item.home_score;
      if (item.away_team_name === awayTeamName) return item.away_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const awayAgainst = awayRecent
    .map((item) => {
      if (item.home_team_name === awayTeamName) return item.away_score;
      if (item.away_team_name === awayTeamName) return item.home_score;
      return null;
    })
    .filter((value): value is number => typeof value === "number");

  const [
    homeProjectedLineups,
    awayProjectedLineups,
    competitionStandings,
    matchEvents,
  ] = await Promise.all([
    loadProjectedLineup(matchId, homeTeamId),
    loadProjectedLineup(matchId, awayTeamId),
    loadCompetitionStandings(match.competition_id, language),
    loadMatchEvents(matchId, match.status, language),
  ]);

  const homeFormStats = computeTeamFormStats(homeRecent, homeTeamName);
  const awayFormStats = computeTeamFormStats(awayRecent, awayTeamName);
  const matchStats = computeMatchStats(
    matchEvents,
    homeTeamName,
    awayTeamName,
  );

  return {
    match: {
      id: match.id,
      kickoff_at: match.kickoff_at,
      status: match.status,
      venue: match.venue,
      home_score: match.home_score,
      away_score: match.away_score,
      competition: match.competition
        ? {
            family: match.competition.family ?? null,
            id: match.competition.id,
            name: match.competition.name,
            season: match.competition.season,
          }
        : null,
      home_team: match.home_team
        ? {
            ...match.home_team,
            name: homeTeamName,
          }
        : null,
      away_team: match.away_team
        ? {
            ...match.away_team,
            name: awayTeamName,
          }
        : null,
    },
    match_phase: deriveMatchPhase(match.external_ids),
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
        ...homeFormStats,
      },
      away: {
        avg_points_for_last_5: average(awayFor),
        avg_points_against_last_5: average(awayAgainst),
        ...awayFormStats,
      },
      match: matchStats,
    },
  };
}
