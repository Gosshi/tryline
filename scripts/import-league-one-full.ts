import { getSupabaseServerClient } from "@/lib/db/server";
import {
  fetchLeagueOneMatchDetail,
  type LeagueOneEvent,
  type LeagueOnePlayer,
} from "@/lib/scrapers/league-one-match";
import {
  fetchLeagueOneSchedule,
  type LeagueOneScheduleEntry,
} from "@/lib/scrapers/league-one-schedule";

import type { Json } from "@/lib/db/types";

type TeamLookup = Record<string, string>;

type PlayerRow = {
  id: string;
  name: string;
};

type ImportedMatchRow = {
  away_team_id: string;
  external_ids: Json;
  home_team_id: string;
  id: string;
};

const FAMILY = "league-one";
const SOURCE = "league-one-jp";
const EXPECTED_MIN_MATCH_COUNT = 100;

const EVENT_TYPE_TO_DB: Record<LeagueOneEvent["event_type"], string> = {
  conversion: "conversion",
  drop_goal: "drop_goal",
  penalty: "penalty_goal",
  try: "try",
};

function parseSeasonArg(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    console.error(
      "Usage: node --env-file=.env.production.local tools/run-ts.cjs scripts/import-league-one-full.ts <YYYY-YY>",
    );
    process.exit(1);
  }

  return value;
}

function getCompetitionDates(entries: LeagueOneScheduleEntry[]) {
  const dates = entries
    .map((entry) => entry.kickoff_at.slice(0, 10))
    .sort((a, b) => a.localeCompare(b));
  const startDate = dates[0];
  const endDate = dates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Unable to derive League One competition dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(
  season: string,
  entries: LeagueOneScheduleEntry[],
) {
  const client = getSupabaseServerClient();
  const { endDate, startDate } = getCompetitionDates(entries);
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: endDate,
        family: FAMILY,
        name: `Japan Rugby League One ${season}`,
        season,
        slug: `${FAMILY}-${season}`,
        start_date: startDate,
      },
      { onConflict: "slug" },
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

function buildExternalIds(entry: LeagueOneScheduleEntry): Record<string, Json> {
  return {
    league_one_match_id: entry.league_one_match_id,
    match_url: entry.match_url,
    round: entry.round,
    source: SOURCE,
  };
}

function getLeagueOneMatchId(externalIds: Json) {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const value = externalIds.league_one_match_id;

  return typeof value === "number" ? value : null;
}

async function upsertMatches(
  entries: LeagueOneScheduleEntry[],
  competitionId: string,
  teamLookup: TeamLookup,
) {
  const client = getSupabaseServerClient();
  const rows = entries.map((entry) => {
    const homeTeamId = teamLookup[entry.home_team_slug];
    const awayTeamId = teamLookup[entry.away_team_slug];

    if (!homeTeamId || !awayTeamId) {
      console.error(
        `Unable to resolve team ids for ${entry.home_team_slug} vs ${entry.away_team_slug}`,
      );
      process.exit(1);
    }

    return {
      away_score: entry.away_score,
      away_team_id: awayTeamId,
      competition_id: competitionId,
      external_ids: buildExternalIds(entry),
      home_score: entry.home_score,
      home_team_id: homeTeamId,
      kickoff_at: entry.kickoff_at,
      status: "finished",
      venue: entry.venue,
    };
  });

  const { data, error } = await client
    .from("matches")
    .upsert(rows, {
      onConflict: "competition_id,home_team_id,away_team_id,kickoff_at",
    })
    .select("id, home_team_id, away_team_id, external_ids");

  if (error) {
    throw error;
  }

  const matchByLeagueOneId = new Map<number, ImportedMatchRow>();

  for (const match of (data ?? []) as ImportedMatchRow[]) {
    const leagueOneMatchId = getLeagueOneMatchId(match.external_ids);

    if (leagueOneMatchId !== null) {
      matchByLeagueOneId.set(leagueOneMatchId, match);
    }
  }

  return matchByLeagueOneId;
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

async function ensurePlayerIds(
  teamId: string,
  names: string[],
): Promise<Map<string, string>> {
  const client = getSupabaseServerClient();
  const uniqueNames = [...new Set(names)];

  if (uniqueNames.length === 0) {
    return new Map();
  }

  const { data: existing, error: existingError } = await client
    .from("players")
    .select("id, name")
    .eq("team_id", teamId)
    .in("name", uniqueNames);

  if (existingError) {
    throw existingError;
  }

  const playerIdByName = new Map(
    ((existing ?? []) as PlayerRow[]).map((player) => [player.name, player.id]),
  );
  const missingNames = uniqueNames.filter((name) => !playerIdByName.has(name));

  if (missingNames.length > 0) {
    const { error: insertError } = await client.from("players").insert(
      missingNames.map((name) => ({
        external_ids: { source: SOURCE },
        name,
        team_id: teamId,
      })),
    );

    if (insertError) {
      throw insertError;
    }

    const { data: inserted, error: insertedError } = await client
      .from("players")
      .select("id, name")
      .eq("team_id", teamId)
      .in("name", missingNames);

    if (insertedError) {
      throw insertedError;
    }

    ((inserted ?? []) as PlayerRow[]).forEach((player) => {
      playerIdByName.set(player.name, player.id);
    });
  }

  return playerIdByName;
}

async function upsertMatchLineups(params: {
  awayTeamId: string;
  homeTeamId: string;
  matchId: string;
  players: LeagueOnePlayer[];
  printUrl: string;
}) {
  const client = getSupabaseServerClient();
  const homePlayers = params.players.filter(
    (player) => player.team_side === "home",
  );
  const awayPlayers = params.players.filter(
    (player) => player.team_side === "away",
  );
  const [homePlayerIds, awayPlayerIds] = await Promise.all([
    ensurePlayerIds(
      params.homeTeamId,
      homePlayers.map((player) => player.player_name),
    ),
    ensurePlayerIds(
      params.awayTeamId,
      awayPlayers.map((player) => player.player_name),
    ),
  ]);
  const rows = params.players.flatMap((player) => {
    const teamId =
      player.team_side === "home" ? params.homeTeamId : params.awayTeamId;
    const playerId =
      player.team_side === "home"
        ? homePlayerIds.get(player.player_name)
        : awayPlayerIds.get(player.player_name);

    if (!playerId) {
      return [];
    }

    return [
      {
        jersey_number: player.jersey_number,
        match_id: params.matchId,
        player_id: playerId,
        source_url: params.printUrl,
        team_id: teamId,
      },
    ];
  });

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await client
    .from("match_lineups")
    .upsert(rows, { onConflict: "match_id,team_id,jersey_number" });

  if (error) {
    throw error;
  }

  return rows.length;
}

async function upsertMatchEvents(params: {
  awayPlayerIds: Map<string, string>;
  awayTeamId: string;
  events: LeagueOneEvent[];
  homePlayerIds: Map<string, string>;
  homeTeamId: string;
  matchId: string;
}) {
  const client = getSupabaseServerClient();
  const deleteResult = await client
    .from("match_events")
    .delete()
    .eq("match_id", params.matchId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  if (params.events.length === 0) {
    return 0;
  }

  const rows = params.events.map((event) => {
    const teamId =
      event.team_side === "home" ? params.homeTeamId : params.awayTeamId;
    const playerIds =
      event.team_side === "home" ? params.homePlayerIds : params.awayPlayerIds;

    return {
      match_id: params.matchId,
      metadata: { player_name: event.player_name, source: SOURCE } as Json,
      minute: event.minute,
      player_id: playerIds.get(event.player_name) ?? null,
      team_id: teamId,
      type: EVENT_TYPE_TO_DB[event.event_type],
    };
  });

  const { error } = await client.from("match_events").insert(rows);

  if (error) {
    throw error;
  }

  return rows.length;
}

async function importMatchDetail(
  entry: LeagueOneScheduleEntry,
  match: ImportedMatchRow,
) {
  const printUrl = `https://league-one.jp/match/${entry.league_one_match_id}/print`;
  const detail = await fetchLeagueOneMatchDetail(entry.league_one_match_id);
  const homePlayers = detail.players.filter(
    (player) => player.team_side === "home",
  );
  const awayPlayers = detail.players.filter(
    (player) => player.team_side === "away",
  );
  const [homePlayerIds, awayPlayerIds] = await Promise.all([
    ensurePlayerIds(
      match.home_team_id,
      homePlayers.map((player) => player.player_name),
    ),
    ensurePlayerIds(
      match.away_team_id,
      awayPlayers.map((player) => player.player_name),
    ),
  ]);
  const lineupsInserted = await upsertMatchLineups({
    awayTeamId: match.away_team_id,
    homeTeamId: match.home_team_id,
    matchId: match.id,
    players: detail.players,
    printUrl,
  });
  const eventsInserted = await upsertMatchEvents({
    awayPlayerIds,
    awayTeamId: match.away_team_id,
    events: detail.events,
    homePlayerIds,
    homeTeamId: match.home_team_id,
    matchId: match.id,
  });

  return { eventsInserted, lineupsInserted };
}

async function main() {
  const season = parseSeasonArg(process.argv[2]);
  const entries = await fetchLeagueOneSchedule(season);

  if (entries.length < EXPECTED_MIN_MATCH_COUNT) {
    console.error(
      `Expected at least ${EXPECTED_MIN_MATCH_COUNT} finished League One D1 matches, got ${entries.length}.`,
    );
    process.exit(1);
  }

  const competitionId = await upsertCompetition(season, entries);
  const teamLookup = await getTeamLookup(
    entries.flatMap((entry) => [entry.home_team_slug, entry.away_team_slug]),
  );
  const matchByLeagueOneId = await upsertMatches(
    entries,
    competitionId,
    teamLookup,
  );
  const teamCount = await upsertCompetitionTeams(competitionId, teamLookup);

  let lineupsInserted = 0;
  let eventsInserted = 0;

  for (const entry of entries) {
    const match = matchByLeagueOneId.get(entry.league_one_match_id);

    if (!match) {
      console.warn(
        `Skipping League One match ${entry.league_one_match_id}: DB match row was not returned.`,
      );
      continue;
    }

    const result = await importMatchDetail(entry, match);
    lineupsInserted += result.lineupsInserted;
    eventsInserted += result.eventsInserted;

    console.log(
      `Imported League One match ${entry.league_one_match_id}: lineups=${result.lineupsInserted} events=${result.eventsInserted}`,
    );
  }

  console.log(
    `Imported League One ${season}: matches=${matchByLeagueOneId.size} teams=${teamCount} lineups=${lineupsInserted} events=${eventsInserted}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
