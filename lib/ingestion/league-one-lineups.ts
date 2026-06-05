import { createHash } from "node:crypto";

import { fetchLeagueOneMatchDetail } from "@/lib/scrapers/league-one-match";

import type { Database, Json } from "@/lib/db/types";
import type { LeagueOneMatchDetail } from "@/lib/scrapers/league-one-match";
import type { SupabaseClient } from "@supabase/supabase-js";

const LEAGUE_ONE_SOURCE = "league-one.jp";
const LEAGUE_ONE_BASE_URL = "https://league-one.jp";

type Relation<T> = T | T[] | null;

type LeagueOneLineupTarget = {
  away_team_id: string;
  competition: Relation<{ family: string | null }>;
  external_ids: Json;
  home_team_id: string;
  id: string;
  match_lineups: Array<{ match_id: string }> | null;
  status: string;
};

type PlayerRow = {
  id: string;
  name: string;
};

type LeagueOneLineupsDb = SupabaseClient<Database>;

export type LeagueOneLineupsIngestResult = {
  lineups_inserted: number;
  no_lineup: number;
  processed: number;
  skipped_existing: number;
  skipped_invalid_event_id: number;
  skipped_not_league_one: number;
  targets: number;
};

function firstRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function asJsonObject(value: Json): Record<string, Json> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, Json>;
}

export function extractLeagueOneMatchNumber(externalIds: Json): number | null {
  const ids = asJsonObject(externalIds);
  const eventId =
    typeof ids.wikipedia_event_id === "string" ? ids.wikipedia_event_id : null;
  const match = eventId?.match(/^match_(\d+)$/);

  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);

  return Number.isInteger(parsed) ? parsed : null;
}

export function buildLeagueOnePrintUrl(matchNumber: number): string {
  return `${LEAGUE_ONE_BASE_URL}/match/${matchNumber}/print`;
}

export function buildLeagueOneMatchPageLineupUrl(matchNumber: number): string {
  return `${LEAGUE_ONE_BASE_URL}/match/${matchNumber}?t1=1`;
}

export function isLeagueOneLineupTarget(
  target: LeagueOneLineupTarget,
): boolean {
  const family = firstRelation(target.competition)?.family;

  return (
    family === "league-one" &&
    (target.status === "scheduled" || target.status === "finished")
  );
}

export function buildLeagueOnePlayerSlug(teamId: string, name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha1")
    .update(`${teamId}:${name}`)
    .digest("hex")
    .slice(0, 8);

  return ascii ? `${ascii}-${hash}` : `player-${hash}`;
}

async function getLineupTargets(params: {
  db: LeagueOneLineupsDb;
  matchId?: string;
}): Promise<LeagueOneLineupTarget[]> {
  let query = params.db.from("matches").select(
    `
        id,
        status,
        home_team_id,
        away_team_id,
        external_ids,
        competition:competitions!matches_competition_id_fkey (family),
        match_lineups:match_lineups!match_lineups_match_id_fkey (match_id)
      `,
  );

  if (params.matchId) {
    query = query.eq("id", params.matchId);
  } else {
    query = query.in("status", ["scheduled", "finished"]);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as LeagueOneLineupTarget[];
}

async function ensurePlayerIds(params: {
  db: LeagueOneLineupsDb;
  names: string[];
  teamId: string;
}): Promise<Map<string, string>> {
  const uniqueNames = [...new Set(params.names)].filter(Boolean);

  if (uniqueNames.length === 0) {
    return new Map();
  }

  const { data: existing, error: existingError } = await params.db
    .from("players")
    .select("id, name")
    .eq("team_id", params.teamId)
    .in("name", uniqueNames);

  if (existingError) {
    throw existingError;
  }

  const playerIdByName = new Map(
    ((existing ?? []) as PlayerRow[]).map((player) => [player.name, player.id]),
  );
  const missingNames = uniqueNames.filter((name) => !playerIdByName.has(name));

  if (missingNames.length > 0) {
    const { error: upsertError } = await params.db.from("players").upsert(
      missingNames.map((name) => ({
        external_ids: { source: LEAGUE_ONE_SOURCE },
        name,
        slug: buildLeagueOnePlayerSlug(params.teamId, name),
        team_id: params.teamId,
      })),
      { onConflict: "slug" },
    );

    if (upsertError) {
      throw upsertError;
    }

    const { data: inserted, error: insertedError } = await params.db
      .from("players")
      .select("id, name")
      .eq("team_id", params.teamId)
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
  db: LeagueOneLineupsDb;
  detail: LeagueOneMatchDetail;
  match: LeagueOneLineupTarget;
  sourceUrl: string;
}) {
  const homePlayers = params.detail.players.filter(
    (player) => player.team_side === "home",
  );
  const awayPlayers = params.detail.players.filter(
    (player) => player.team_side === "away",
  );
  const [homePlayerIds, awayPlayerIds] = await Promise.all([
    ensurePlayerIds({
      db: params.db,
      names: homePlayers.map((player) => player.player_name),
      teamId: params.match.home_team_id,
    }),
    ensurePlayerIds({
      db: params.db,
      names: awayPlayers.map((player) => player.player_name),
      teamId: params.match.away_team_id,
    }),
  ]);
  const rows = params.detail.players.flatMap((player) => {
    const teamId =
      player.team_side === "home"
        ? params.match.home_team_id
        : params.match.away_team_id;
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
        match_id: params.match.id,
        player_id: playerId,
        source_url: params.sourceUrl,
        team_id: teamId,
      },
    ];
  });

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await params.db
    .from("match_lineups")
    .upsert(rows, { onConflict: "match_id,team_id,jersey_number" });

  if (error) {
    throw error;
  }

  return rows.length;
}

export async function ingestLeagueOneLineups(params: {
  db: LeagueOneLineupsDb;
  fetchMatchDetail?: (
    matchNumber: number,
    options: { allowEmptyLineups: boolean },
  ) => Promise<LeagueOneMatchDetail>;
  matchId?: string;
}): Promise<LeagueOneLineupsIngestResult> {
  const targets = await getLineupTargets({
    db: params.db,
    matchId: params.matchId,
  });
  const result: LeagueOneLineupsIngestResult = {
    lineups_inserted: 0,
    no_lineup: 0,
    processed: 0,
    skipped_existing: 0,
    skipped_invalid_event_id: 0,
    skipped_not_league_one: 0,
    targets: targets.length,
  };
  const fetchMatchDetail = params.fetchMatchDetail ?? fetchLeagueOneMatchDetail;

  for (const target of targets) {
    if (!isLeagueOneLineupTarget(target)) {
      result.skipped_not_league_one += 1;
      continue;
    }

    if ((target.match_lineups ?? []).length > 0) {
      result.skipped_existing += 1;
      continue;
    }

    const matchNumber = extractLeagueOneMatchNumber(target.external_ids);

    if (matchNumber === null) {
      result.skipped_invalid_event_id += 1;
      console.warn("[league-one-lineups] skipping match without numeric id", {
        matchId: target.id,
      });
      continue;
    }

    const detail = await fetchMatchDetail(matchNumber, {
      allowEmptyLineups: true,
    });

    if (detail.players.length === 0) {
      result.no_lineup += 1;
      result.processed += 1;
      continue;
    }

    result.lineups_inserted += await upsertMatchLineups({
      db: params.db,
      detail,
      match: target,
      sourceUrl: detail.sourceUrl,
    });
    result.processed += 1;
  }

  return result;
}
