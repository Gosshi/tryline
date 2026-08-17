import { getSupabaseServerClient } from "@/lib/db/server";
import { getCompetitionDisplayName } from "@/lib/format/competition";
import {
  JAPANESE_COMPETITION_NAMES_BY_FAMILY,
  JAPANESE_TEAM_NAMES_BY_SLUG,
} from "@/lib/format/japanese-names";
import { pointsForMatchEvent } from "@/lib/format/match-event-points";
import { getTeamDisplayName } from "@/lib/format/team";
import { deriveTeamStatsFromSourcedFacts } from "@/lib/llm/sourced-facts/derive-team-stats";
import { loadSourcedFactsForMatch } from "@/lib/llm/sourced-facts/fetch";
import { computeDerivedMatchStats } from "@/lib/llm/stages/derived-stats";

import type { Json } from "@/lib/db/types";
import type {
  AssembledContentInput,
  ContentType,
  ContentLanguage,
  MatchTeamStats,
  MatchPhase,
  ScoreTimeline,
  Top14TeamStats,
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

export function computeMatchStats(
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

    if (event.type === "penalty_goal") {
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

export function pointsForEvent(
  event: Pick<
    AssembledContentInput["match_events"][number],
    "is_penalty_try" | "type"
  >,
): number {
  return pointsForMatchEvent(event);
}

export function computeScoreTimeline(
  events: AssembledContentInput["match_events"],
  homeTeamName: string,
  awayTeamName: string,
): ScoreTimeline | null {
  if (events.length === 0) {
    return null;
  }

  let homeScore = 0;
  let awayScore = 0;
  let htHome = 0;
  let htAway = 0;
  let htSet = false;
  let prevLeader: "home" | "away" | "draw" = "draw";
  const leadChanges: ScoreTimeline["lead_changes"] = [];
  const scoringSnapshots: Array<{
    event: AssembledContentInput["match_events"][number];
    home: number;
    away: number;
    leaderBefore: "home" | "away" | "draw";
    leaderAfter: "home" | "away" | "draw";
  }> = [];

  for (const event of events) {
    const minute = event.minute ?? 0;
    const points = pointsForEvent(event);

    if (points === 0) {
      continue;
    }

    if (!htSet && minute > 40) {
      htHome = homeScore;
      htAway = awayScore;
      htSet = true;
    }

    const isHome = event.team_name === homeTeamName;
    const isAway = event.team_name === awayTeamName;

    if (isHome) {
      homeScore += points;
    } else if (isAway) {
      awayScore += points;
    } else {
      continue;
    }

    const currentLeader: "home" | "away" | "draw" =
      homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";

    scoringSnapshots.push({
      away: awayScore,
      event,
      home: homeScore,
      leaderAfter: currentLeader,
      leaderBefore: prevLeader,
    });

    if (currentLeader !== prevLeader) {
      leadChanges.push({
        away: awayScore,
        home: homeScore,
        minute,
        new_leader: currentLeader,
      });
      prevLeader = currentLeader;
    }
  }

  if (!htSet) {
    htHome = homeScore;
    htAway = awayScore;
  }

  const winner =
    homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : null;
  let winningScore: ScoreTimeline["winning_score"] = null;

  if (winner) {
    for (let index = scoringSnapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = scoringSnapshots[index]!;

      if (snapshot.leaderAfter === winner && snapshot.leaderBefore !== winner) {
        winningScore = {
          minute: snapshot.event.minute ?? 0,
          player: snapshot.event.player_name,
          team: winner,
          type: snapshot.event.type,
        };
        break;
      }
    }
  }

  return {
    final_away: awayScore,
    final_home: homeScore,
    ht_away: htAway,
    ht_home: htHome,
    lead_changes: leadChanges,
    score_progression: scoringSnapshots.map((snapshot) => ({
      away: snapshot.away,
      home: snapshot.home,
      minute: snapshot.event.minute ?? 0,
      player: snapshot.event.player_name || null,
      team: snapshot.event.team_name === homeTeamName ? "home" : "away",
      type: snapshot.event.type,
    })),
    winning_score: winningScore,
  };
}

export function eventTotalsMatchFinalScore(
  scoreTimeline: ScoreTimeline | null,
  homeScore: number | null,
  awayScore: number | null,
): boolean {
  return (
    scoreTimeline !== null &&
    homeScore !== null &&
    awayScore !== null &&
    scoreTimeline.final_home === homeScore &&
    scoreTimeline.final_away === awayScore
  );
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
  nameJa?: string | null,
  slug?: string | null,
): string {
  if (language === "en" && englishName) {
    return englishName;
  }

  return getTeamDisplayName({ name, nameJa: nameJa ?? null, slug }, language);
}

export function deriveMatchPhase(externalIds: unknown): MatchPhase | null {
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

  if (roundName.includes("3rd place") || roundName.includes("bronze")) {
    return "playoff_third_place";
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
): Promise<{
  confirmed: boolean;
  entries: AssembledContentInput["projected_lineups"]["home"];
  playerNameReferences: PlayerNameReference[];
}> {
  const db = getSupabaseServerClient();

  const { data: matchLineups, error: lineupsError } = await db
    .from("match_lineups")
    .select(
      "jersey_number, is_starter, player:players(name, name_ja, position)",
    )
    .eq("match_id", matchId)
    .eq("team_id", teamId)
    .order("jersey_number", { ascending: true });

  if (lineupsError) {
    throw lineupsError;
  }

  if ((matchLineups ?? []).length > 0) {
    return {
      confirmed: true,
      entries: matchLineups.map((item) => ({
        name: item.player?.name ?? "",
        position: item.player?.position ?? null,
        jersey_number: item.jersey_number,
        is_starter: item.is_starter,
      })),
      playerNameReferences: matchLineups.map((item) => ({
        player: item.player,
      })),
    };
  }

  const { data: players, error: playersError } = await db
    .from("players")
    .select("name, position, caps")
    .eq("team_id", teamId)
    .order("caps", { ascending: false, nullsFirst: false });

  if (playersError) {
    throw playersError;
  }

  return {
    confirmed: false,
    entries: (players ?? []).map((player) => ({
      name: player.name,
      position: player.position,
      jersey_number: null,
      is_starter: null,
    })),
    playerNameReferences: [],
  };
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
        team:teams(slug, name, english_name)
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
      ? resolveTeamName(
          row.team.name,
          row.team.english_name,
          language,
          null,
          row.team.slug,
        )
      : "",
    total_points: row.total_points,
    tries_for: row.tries_for,
    won: row.won,
  }));
}

type PlayerNameReference = {
  player: { name: string; name_ja: string | null } | null;
};

export function buildJapanesePlayerNameGlossary(
  playerNameReferences: PlayerNameReference[],
): NonNullable<AssembledContentInput["japanese_name_glossary"]> {
  const seen = new Set<string>();

  return playerNameReferences.flatMap(({ player }) => {
    if (!player?.name_ja || seen.has(player.name)) {
      return [];
    }

    seen.add(player.name);
    return [
      {
        japanese: player.name_ja,
        kind: "player" as const,
        source: player.name,
      },
    ];
  });
}

async function loadTeamRosterPlayerNameReferences(
  teamIds: string[],
): Promise<PlayerNameReference[]> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("players")
    .select("name, name_ja")
    .in("team_id", teamIds)
    .not("name_ja", "is", null);

  if (error) {
    throw error;
  }

  return (data ?? []).map((player) => ({ player }));
}

async function loadMatchEvents(
  matchId: string,
  status: string,
  language: ContentLanguage,
): Promise<{
  events: AssembledContentInput["match_events"];
  playerNameReferences: PlayerNameReference[];
}> {
  if (status !== "finished") {
    return { events: [], playerNameReferences: [] };
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_events")
    .select(
      "type, minute, metadata, player:players(name, name_ja), team:teams(slug, name, english_name)",
    )
    .eq("match_id", matchId)
    .order("minute", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const events = rows.map((event) => {
    const metadata = asJsonObject(event.metadata);
    const playerName = metadata.player_name;
    const isPenaltyTry = metadata.is_penalty_try;

    return {
      ...(isPenaltyTry === true ? { is_penalty_try: true } : {}),
      minute: event.minute,
      player_name: typeof playerName === "string" ? playerName : "",
      team_name: event.team
        ? resolveTeamName(
            event.team.name,
            event.team.english_name,
            language,
            null,
            event.team.slug,
          )
        : "",
      type: event.type,
    };
  });

  return {
    events,
    playerNameReferences: rows.map((event) => ({ player: event.player })),
  };
}

function mapTeamStatsRow(row: {
  carries: number | null;
  errors: number | null;
  lineouts_total: number | null;
  lineouts_won: number | null;
  penalties_conceded: number | null;
  possession_pct: number | null;
  red_cards: number | null;
  scrums_total: number | null;
  scrums_won: number | null;
  tackles_made: number | null;
  tackles_missed: number | null;
  territory_pct: number | null;
  yellow_cards: number | null;
}): Top14TeamStats {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  ) as Top14TeamStats;
}

async function loadTeamStats(args: {
  awayTeamId: string;
  competitionFamily: string | null | undefined;
  homeTeamId: string;
  matchId: string;
}): Promise<MatchTeamStats> {
  if (args.competitionFamily !== "top-14") {
    return null;
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_team_stats")
    .select(
      `
        team_id,
        possession_pct,
        territory_pct,
        lineouts_won,
        lineouts_total,
        scrums_won,
        scrums_total,
        tackles_made,
        tackles_missed,
        carries,
        penalties_conceded,
        yellow_cards,
        red_cards,
        errors
      `,
    )
    .eq("match_id", args.matchId);

  if (error) {
    throw error;
  }

  const homeRow = (data ?? []).find((row) => row.team_id === args.homeTeamId);
  const awayRow = (data ?? []).find((row) => row.team_id === args.awayTeamId);
  const home = homeRow ? mapTeamStatsRow(homeRow) : null;
  const away = awayRow ? mapTeamStatsRow(awayRow) : null;

  if (!home && !away) {
    return null;
  }

  return { away, home };
}

export async function assembleMatchContentInput(
  matchId: string,
  language: ContentLanguage = "ja",
  contentType: ContentType = "preview",
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
        competition:competitions(id, slug, name, season, family),
        home_team:teams!matches_home_team_id_fkey(id, slug, name, english_name, short_code, country),
        away_team:teams!matches_away_team_id_fkey(id, slug, name, english_name, short_code, country)
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
        null,
        match.home_team.slug,
      )
    : "";
  const awayTeamName = match.away_team
    ? resolveTeamName(
        match.away_team.name,
        match.away_team.english_name,
        language,
        null,
        match.away_team.slug,
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
        home_team:teams!matches_home_team_id_fkey(slug, name, english_name),
        away_team:teams!matches_away_team_id_fkey(slug, name, english_name),
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
            null,
            item.home_team.slug,
          )
        : "",
      away_team_name: item.away_team
        ? resolveTeamName(
            item.away_team.name,
            item.away_team.english_name,
            language,
            null,
            item.away_team.slug,
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
            null,
            item.home_team.slug,
          )
        : "",
      away_team_name: item.away_team
        ? resolveTeamName(
            item.away_team.name,
            item.away_team.english_name,
            language,
            null,
            item.away_team.slug,
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
            null,
            item.home_team.slug,
          )
        : "",
      away_team_name: item.away_team
        ? resolveTeamName(
            item.away_team.name,
            item.away_team.english_name,
            language,
            null,
            item.away_team.slug,
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
    loadedMatchEvents,
    rosterPlayerNameReferences,
    sourcedFacts,
    teamStats,
  ] = await Promise.all([
    loadProjectedLineup(matchId, homeTeamId),
    loadProjectedLineup(matchId, awayTeamId),
    loadCompetitionStandings(match.competition_id, language),
    loadMatchEvents(matchId, match.status, language),
    loadTeamRosterPlayerNameReferences([homeTeamId, awayTeamId]),
    loadSourcedFactsForMatch(matchId, contentType),
    loadTeamStats({
      awayTeamId,
      competitionFamily: match.competition?.family,
      homeTeamId,
      matchId,
    }),
  ]);

  const matchEvents = loadedMatchEvents.events;
  const homeFormStats = computeTeamFormStats(homeRecent, homeTeamName);
  const awayFormStats = computeTeamFormStats(awayRecent, awayTeamName);
  const matchStats = computeMatchStats(matchEvents, homeTeamName, awayTeamName);
  const normalizedSourcedFacts = sourcedFacts.map((fact) => ({
    confidence:
      fact.confidence === "high" || fact.confidence === "medium"
        ? fact.confidence
        : "medium",
    fact: fact.fact,
    source_domain: fact.source_domain,
    source_url: fact.source_url,
  }));
  const derivedTeamStats = teamStats
    ? null
    : deriveTeamStatsFromSourcedFacts(
        normalizedSourcedFacts,
        [
          match.home_team?.name,
          match.home_team?.english_name,
          homeTeamName,
        ].filter((name): name is string => Boolean(name)),
        [
          match.away_team?.name,
          match.away_team?.english_name,
          awayTeamName,
        ].filter((name): name is string => Boolean(name)),
      );
  const resolvedTeamStats = teamStats ?? derivedTeamStats?.teamStats ?? null;
  const consumedSourcedFactIndexes = new Set(
    derivedTeamStats?.consumedFactIndexes ?? [],
  );
  const remainingSourcedFacts = normalizedSourcedFacts.filter(
    (_, index) => !consumedSourcedFactIndexes.has(index),
  );
  const scoreTimeline = computeScoreTimeline(
    matchEvents,
    homeTeamName,
    awayTeamName,
  );
  const projectedLineups = {
    away: awayProjectedLineups.entries,
    confirmed: {
      away: awayProjectedLineups.confirmed,
      home: homeProjectedLineups.confirmed,
    },
    home: homeProjectedLineups.entries,
  };
  // Derived stats assert exact figures (e.g. "ゴール4/5"), so only compute
  // them when the event log provably reconstructs the final score.
  const derivedStats = eventTotalsMatchFinalScore(
    scoreTimeline,
    match.home_score,
    match.away_score,
  )
    ? computeDerivedMatchStats(
        matchEvents,
        projectedLineups,
        homeTeamName,
        awayTeamName,
      )
    : null;
  const competitionName = match.competition
    ? getCompetitionDisplayName(
        {
          family: match.competition.family ?? null,
          name: match.competition.name,
          nameJa: null,
          slug: match.competition.slug,
        },
        language,
      )
    : "";
  const competitionNameJa = match.competition?.family
    ? (JAPANESE_COMPETITION_NAMES_BY_FAMILY[match.competition.family] ?? null)
    : null;
  const homeNameJa = match.home_team?.slug
    ? (JAPANESE_TEAM_NAMES_BY_SLUG[match.home_team.slug] ?? null)
    : null;
  const awayNameJa = match.away_team?.slug
    ? (JAPANESE_TEAM_NAMES_BY_SLUG[match.away_team.slug] ?? null)
    : null;
  const japaneseNameGlossary: NonNullable<
    AssembledContentInput["japanese_name_glossary"]
  > = [
    competitionNameJa && match.competition
      ? {
          japanese: competitionNameJa,
          kind: "competition" as const,
          source: match.competition.name,
        }
      : null,
    homeNameJa && match.home_team
      ? {
          japanese: homeNameJa,
          kind: "team" as const,
          source: match.home_team.name,
        }
      : null,
    awayNameJa && match.away_team
      ? {
          japanese: awayNameJa,
          kind: "team" as const,
          source: match.away_team.name,
        }
      : null,
    ...buildJapanesePlayerNameGlossary([
      ...loadedMatchEvents.playerNameReferences,
      ...homeProjectedLineups.playerNameReferences,
      ...awayProjectedLineups.playerNameReferences,
      ...rosterPlayerNameReferences,
    ]),
  ].filter(
    (
      item,
    ): item is NonNullable<
      AssembledContentInput["japanese_name_glossary"]
    >[number] => item !== null,
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
            name: competitionName,
            name_ja: competitionNameJa,
            season: match.competition.season,
            slug: match.competition.slug,
          }
        : null,
      home_team: match.home_team
        ? {
            ...match.home_team,
            name: homeTeamName,
            name_ja: homeNameJa,
          }
        : null,
      away_team: match.away_team
        ? {
            ...match.away_team,
            name: awayTeamName,
            name_ja: awayNameJa,
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
    projected_lineups: projectedLineups,
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
    score_timeline: scoreTimeline,
    derived_stats: derivedStats,
    team_stats: resolvedTeamStats,
    sourced_facts: remainingSourcedFacts,
    japanese_name_glossary: language === "ja" ? japaneseNameGlossary : [],
  };
}
