import { getSupabaseServerClient } from "@/lib/db/server";
import {
  fetchWorldRugbyMatchDetail,
  type WorldRugbyEvent,
  type WorldRugbyPlayer,
} from "@/lib/scrapers/world-rugby-match";
import {
  fetchWorldRugbySchedule,
  type WorldRugbyCompetitionFamily,
  type WorldRugbyMatchEntry,
} from "@/lib/scrapers/world-rugby-schedule";

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

type MatchLineupRow = {
  jersey_number: number;
  match_id: string;
  player_id: string;
  source_url: string;
  team_id: string;
};

type MatchEventRow = {
  match_id: string;
  metadata: Json;
  minute: number | null;
  player_id: string | null;
  team_id: string;
  type: string;
};

type CliOptions = {
  competitionId: string | null;
  family: WorldRugbyCompetitionFamily;
  season: string;
};

export type WorldRugbyFullImportOptions = {
  competitionId?: string | null;
  family: WorldRugbyCompetitionFamily;
  season: string;
};

export type WorldRugbyFullImportResult = {
  eventsInserted: number;
  failedMatches: number;
  lineupsInserted: number;
  matchesImported: number;
  teamsImported: number;
};

const SOURCE = "world-rugby";
const COMPETITION_ID_BY_FAMILY_AND_SEASON: Record<
  WorldRugbyCompetitionFamily,
  Record<string, string>
> = {
  "autumn-nations": {
    "2024": "c805a102-6cbe-4eed-a158-f5878cf1f162",
  },
  pnc: {
    "2024": "735a21a5-9069-4fad-810e-81806f9c47a4",
  },
};

const COMPETITION_NAME_BY_FAMILY: Record<WorldRugbyCompetitionFamily, string> =
  {
    "autumn-nations": "Autumn Nations Series",
    pnc: "Nations Cup",
  };

const EVENT_TYPE_TO_DB: Record<WorldRugbyEvent["event_type"], string> = {
  conversion: "conversion",
  drop_goal: "drop_goal",
  penalty: "penalty_goal",
  try: "try",
};

export function dedupeWorldRugbyLineupRows<T extends MatchLineupRow>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const key = `${row.match_id}-${row.team_id}-${row.jersey_number}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function getEventPlayerName(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata.player_name;

  return typeof value === "string" ? value : "";
}

export function dedupeWorldRugbyEventRows<T extends MatchEventRow>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const row of rows) {
    const key = [
      row.match_id,
      row.minute ?? "null",
      row.type,
      getEventPlayerName(row.metadata),
      row.team_id,
    ].join("-");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function parseArgs(argv: string[]): CliOptions {
  let family: string | null = null;
  let season: string | null = null;
  let competitionId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--family") {
      family = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--family=")) {
      family = arg.slice("--family=".length);
      continue;
    }

    if (arg === "--season") {
      season = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--season=")) {
      season = arg.slice("--season=".length);
      continue;
    }

    if (arg === "--competition-id") {
      competitionId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--competition-id=")) {
      competitionId = arg.slice("--competition-id=".length);
      continue;
    }
  }

  if (family !== "pnc" && family !== "autumn-nations") {
    console.error(
      "Usage: import-world-rugby-full.ts --family pnc|autumn-nations --season YYYY [--competition-id ID]",
    );
    process.exit(1);
  }

  if (!season || !/^\d{4}$/.test(season)) {
    console.error(
      "Usage: import-world-rugby-full.ts --family pnc|autumn-nations --season YYYY [--competition-id ID]",
    );
    process.exit(1);
  }

  return { competitionId, family, season };
}

function resolveCompetitionId(options: WorldRugbyFullImportOptions) {
  const competitionId =
    options.competitionId ??
    COMPETITION_ID_BY_FAMILY_AND_SEASON[options.family][options.season];

  if (!competitionId) {
    throw new Error(
      `Unknown World Rugby competition id for ${options.family} ${options.season}. Pass --competition-id to import this season.`,
    );
  }

  return competitionId;
}

function getCompetitionDates(entries: WorldRugbyMatchEntry[]) {
  const dates = entries
    .map((entry) => entry.kickoff_at.slice(0, 10))
    .sort((a, b) => a.localeCompare(b));
  const startDate = dates[0];
  const endDate = dates.at(-1);

  if (!startDate || !endDate) {
    throw new Error("Unable to derive World Rugby competition dates.");
  }

  return { endDate, startDate };
}

async function upsertCompetition(
  family: WorldRugbyCompetitionFamily,
  season: string,
  entries: WorldRugbyMatchEntry[],
) {
  const client = getSupabaseServerClient();
  const { endDate, startDate } = getCompetitionDates(entries);
  const { data, error } = await client
    .from("competitions")
    .upsert(
      {
        end_date: endDate,
        family,
        name: `${COMPETITION_NAME_BY_FAMILY[family]} ${season}`,
        season,
        slug: `${family}-${season}`,
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

function buildExternalIds(entry: WorldRugbyMatchEntry): Record<string, Json> {
  return {
    match_url: entry.match_url,
    round: entry.round,
    source: SOURCE,
    world_rugby_match_id: entry.world_rugby_match_id,
  };
}

function getWorldRugbyMatchId(externalIds: Json) {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const value = externalIds.world_rugby_match_id;

  return typeof value === "string" ? value : null;
}

async function upsertMatches(
  entries: WorldRugbyMatchEntry[],
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

  const matchByWorldRugbyId = new Map<string, ImportedMatchRow>();

  for (const match of (data ?? []) as ImportedMatchRow[]) {
    const worldRugbyMatchId = getWorldRugbyMatchId(match.external_ids);

    if (worldRugbyMatchId) {
      matchByWorldRugbyId.set(worldRugbyMatchId, match);
    }
  }

  return matchByWorldRugbyId;
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
  players: WorldRugbyPlayer[];
  sourceUrl: string;
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
  const rows: MatchLineupRow[] = params.players.flatMap((player) => {
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
        source_url: params.sourceUrl,
        team_id: teamId,
      },
    ];
  });

  if (rows.length === 0) {
    return 0;
  }

  const dedupedLineups = dedupeWorldRugbyLineupRows(rows);
  const { error } = await client
    .from("match_lineups")
    .upsert(dedupedLineups, { onConflict: "match_id,team_id,jersey_number" });

  if (error) {
    throw error;
  }

  return dedupedLineups.length;
}

async function upsertMatchEvents(params: {
  awayPlayerIds: Map<string, string>;
  awayTeamId: string;
  events: WorldRugbyEvent[];
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

  const rows: MatchEventRow[] = params.events.map((event) => {
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

  const dedupedEvents = dedupeWorldRugbyEventRows(rows);
  const { error } = await client.from("match_events").insert(dedupedEvents);

  if (error) {
    throw error;
  }

  return dedupedEvents.length;
}

async function importMatchDetail(
  entry: WorldRugbyMatchEntry,
  match: ImportedMatchRow,
) {
  const detail = await fetchWorldRugbyMatchDetail(entry.world_rugby_match_id);
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
    sourceUrl: entry.match_url,
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

export async function runWorldRugbyFullImport(
  options: WorldRugbyFullImportOptions,
): Promise<WorldRugbyFullImportResult> {
  const competitionId = resolveCompetitionId(options);
  const entries = await fetchWorldRugbySchedule(competitionId, options.season);
  const mismatchedEntry = entries.find(
    (entry) => entry.competition_family !== options.family,
  );

  if (mismatchedEntry) {
    throw new Error(
      `Competition id ${competitionId} resolved to ${mismatchedEntry.competition_family}, not ${options.family}.`,
    );
  }

  const competitionIdInDb = await upsertCompetition(
    options.family,
    options.season,
    entries,
  );
  const teamLookup = await getTeamLookup(
    entries.flatMap((entry) => [entry.home_team_slug, entry.away_team_slug]),
  );
  const matchByWorldRugbyId = await upsertMatches(
    entries,
    competitionIdInDb,
    teamLookup,
  );
  const teamCount = await upsertCompetitionTeams(competitionIdInDb, teamLookup);

  let lineupsInserted = 0;
  let eventsInserted = 0;
  let failedMatches = 0;

  for (const entry of entries) {
    const match = matchByWorldRugbyId.get(entry.world_rugby_match_id);

    if (!match) {
      console.warn(
        `Skipping World Rugby match ${entry.world_rugby_match_id}: DB match row was not returned.`,
      );
      continue;
    }

    try {
      const result = await importMatchDetail(entry, match);
      lineupsInserted += result.lineupsInserted;
      eventsInserted += result.eventsInserted;

      console.log(
        `Imported World Rugby match ${entry.world_rugby_match_id}: lineups=${result.lineupsInserted} events=${result.eventsInserted}`,
      );
    } catch (error) {
      failedMatches += 1;
      console.error(
        `Failed to import World Rugby match ${entry.world_rugby_match_id}`,
        error,
      );
    }
  }

  console.log(
    `Imported World Rugby ${options.family} ${options.season}: matches=${matchByWorldRugbyId.size} teams=${teamCount} lineups=${lineupsInserted} events=${eventsInserted} failed=${failedMatches}`,
  );

  return {
    eventsInserted,
    failedMatches,
    lineupsInserted,
    matchesImported: matchByWorldRugbyId.size,
    teamsImported: teamCount,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  await runWorldRugbyFullImport(options);
}

if (process.argv[1]?.endsWith("import-world-rugby-full.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
