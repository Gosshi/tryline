import { getSupabasePublicServerClient } from "@/lib/db/public-server";

import type { Json } from "@/lib/db/types";

export type TeamRecord = {
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  form: Array<"W" | "D" | "L">;
  matchCount: number;
};

export type TeamScoringStats = {
  matchCount: number;
  pointsForPerMatch: number;
  triesPerMatch: number;
  penaltyGoalsPerMatch: number;
};

export type TopScorer = {
  playerName: string;
  tries: number;
  conversions: number;
  penalties: number;
  points: number;
};

export type TeamStatsData = {
  record: TeamRecord;
  scoring: TeamScoringStats;
  topScorers: TopScorer[];
};

export type TeamStatsMatchRow = {
  away_score: number | null;
  away_team_id: string;
  home_score: number | null;
  home_team_id: string;
  id: string;
  kickoff_at: string;
};

export type TeamStatsEventRow = {
  match_id: string;
  metadata?: Json | null;
  type: string;
};

const SCORING_EVENT_TYPES = ["try", "penalty_goal", "drop_goal"] as const;
const TOP_SCORER_EVENT_TYPES = [
  "try",
  "conversion",
  "penalty_goal",
  "drop_goal",
] as const;

const EMPTY_RECORD: TeamRecord = {
  draws: 0,
  form: [],
  losses: 0,
  matchCount: 0,
  pointsAgainst: 0,
  pointsFor: 0,
  wins: 0,
};

const EMPTY_SCORING_STATS: TeamScoringStats = {
  matchCount: 0,
  penaltyGoalsPerMatch: 0,
  pointsForPerMatch: 0,
  triesPerMatch: 0,
};

function isScoredMatch(match: TeamStatsMatchRow): boolean {
  return match.home_score !== null && match.away_score !== null;
}

function sortNewestFirst(matches: TeamStatsMatchRow[]): TeamStatsMatchRow[] {
  return [...matches].sort(
    (left, right) =>
      new Date(right.kickoff_at).getTime() -
      new Date(left.kickoff_at).getTime(),
  );
}

function getTeamScores(match: TeamStatsMatchRow, teamId: string) {
  if (!isScoredMatch(match)) {
    return null;
  }

  const isHome = match.home_team_id === teamId;

  return {
    against: isHome ? match.away_score! : match.home_score!,
    for: isHome ? match.home_score! : match.away_score!,
  };
}

function resultFromScores(
  pointsFor: number,
  pointsAgainst: number,
): "W" | "D" | "L" {
  if (pointsFor > pointsAgainst) return "W";
  if (pointsFor < pointsAgainst) return "L";
  return "D";
}

function roundAverage(value: number): number {
  return Number(value.toFixed(1));
}

function playerNameFromMetadata(
  metadata: Json | null | undefined,
): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const playerName = metadata.player_name;

  return typeof playerName === "string" && playerName.trim().length > 0
    ? playerName.trim()
    : null;
}

export function buildTeamRecord(
  matches: TeamStatsMatchRow[],
  teamId: string,
): TeamRecord {
  const record: TeamRecord = { ...EMPTY_RECORD, form: [] };
  const results = sortNewestFirst(matches)
    .map((match) => getTeamScores(match, teamId))
    .filter(
      (scores): scores is { against: number; for: number } => scores !== null,
    )
    .map((scores) => ({
      ...scores,
      result: resultFromScores(scores.for, scores.against),
    }));

  for (const result of results) {
    record.matchCount += 1;
    record.pointsFor += result.for;
    record.pointsAgainst += result.against;

    if (result.result === "W") {
      record.wins += 1;
    } else if (result.result === "D") {
      record.draws += 1;
    } else {
      record.losses += 1;
    }
  }

  record.form = results.slice(0, 5).map((result) => result.result);

  return record;
}

export function buildTeamScoringStats(params: {
  events: TeamStatsEventRow[];
  matches: TeamStatsMatchRow[];
  teamId: string;
}): TeamScoringStats {
  const scoringEvents = params.events.filter((event) =>
    SCORING_EVENT_TYPES.includes(
      event.type as (typeof SCORING_EVENT_TYPES)[number],
    ),
  );
  const matchIds = new Set(scoringEvents.map((event) => event.match_id));

  if (matchIds.size === 0) {
    return { ...EMPTY_SCORING_STATS };
  }

  const pointsFor = params.matches
    .filter((match) => matchIds.has(match.id))
    .reduce((total, match) => {
      const scores = getTeamScores(match, params.teamId);
      return total + (scores?.for ?? 0);
    }, 0);
  const tries = scoringEvents.filter((event) => event.type === "try").length;
  const penalties = scoringEvents.filter(
    (event) => event.type === "penalty_goal" || event.type === "drop_goal",
  ).length;

  return {
    matchCount: matchIds.size,
    penaltyGoalsPerMatch: roundAverage(penalties / matchIds.size),
    pointsForPerMatch: roundAverage(pointsFor / matchIds.size),
    triesPerMatch: roundAverage(tries / matchIds.size),
  };
}

export function buildTopScorers(
  events: TeamStatsEventRow[],
  limit = 5,
): TopScorer[] {
  const scorers = new Map<string, TopScorer>();

  for (const event of events) {
    if (
      !TOP_SCORER_EVENT_TYPES.includes(
        event.type as (typeof TOP_SCORER_EVENT_TYPES)[number],
      )
    ) {
      continue;
    }

    const playerName = playerNameFromMetadata(event.metadata);

    if (!playerName) {
      continue;
    }

    const scorer = scorers.get(playerName) ?? {
      conversions: 0,
      penalties: 0,
      playerName,
      points: 0,
      tries: 0,
    };

    if (event.type === "try") {
      scorer.tries += 1;
    } else if (event.type === "conversion") {
      scorer.conversions += 1;
    } else if (event.type === "penalty_goal" || event.type === "drop_goal") {
      scorer.penalties += 1;
    }

    scorer.points =
      scorer.tries * 5 + scorer.conversions * 2 + scorer.penalties * 3;
    scorers.set(playerName, scorer);
  }

  return [...scorers.values()]
    .sort((left, right) => {
      if (left.points !== right.points) return right.points - left.points;
      if (left.tries !== right.tries) return right.tries - left.tries;
      if (left.penalties !== right.penalties)
        return right.penalties - left.penalties;
      if (left.conversions !== right.conversions) {
        return right.conversions - left.conversions;
      }

      return left.playerName.localeCompare(right.playerName);
    })
    .slice(0, limit);
}

async function getFinishedMatchesForTeam(
  teamId: string,
  limit: number,
): Promise<TeamStatsMatchRow[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      "id, home_team_id, away_team_id, home_score, away_score, kickoff_at",
    )
    .eq("status", "finished")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order("kickoff_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as TeamStatsMatchRow[];
}

async function getFinishedMatchesByIds(
  matchIds: string[],
): Promise<TeamStatsMatchRow[]> {
  if (matchIds.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select(
      "id, home_team_id, away_team_id, home_score, away_score, kickoff_at",
    )
    .eq("status", "finished")
    .in("id", matchIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as TeamStatsMatchRow[];
}

async function getTeamEvents(
  teamId: string,
  eventTypes: readonly string[],
): Promise<TeamStatsEventRow[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_events")
    .select("match_id, type, metadata")
    .eq("team_id", teamId)
    .in("type", [...eventTypes]);

  if (error) {
    throw error;
  }

  return (data ?? []) as TeamStatsEventRow[];
}

export async function getTeamRecord(teamId: string): Promise<TeamRecord> {
  const matches = await getFinishedMatchesForTeam(teamId, 30);

  return buildTeamRecord(matches, teamId);
}

export async function getTeamScoringStats(
  teamId: string,
): Promise<TeamScoringStats> {
  const events = await getTeamEvents(teamId, SCORING_EVENT_TYPES);
  const matchIds = [...new Set(events.map((event) => event.match_id))];
  const matches = await getFinishedMatchesByIds(matchIds);

  return buildTeamScoringStats({ events, matches, teamId });
}

export async function getTeamTopScorers(
  teamId: string,
  limit = 5,
): Promise<TopScorer[]> {
  const events = await getTeamEvents(teamId, TOP_SCORER_EVENT_TYPES);

  return buildTopScorers(events, limit);
}

export async function getTeamStatsData(teamId: string): Promise<TeamStatsData> {
  const [record, scoring, topScorers] = await Promise.all([
    getTeamRecord(teamId),
    getTeamScoringStats(teamId),
    getTeamTopScorers(teamId),
  ]);

  return { record, scoring, topScorers };
}

export async function getTeamStatsDataBySlug(
  slug: string,
): Promise<TeamStatsData | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return getTeamStatsData((data as { id: string }).id);
}
