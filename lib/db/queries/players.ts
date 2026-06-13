import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { listMatchIdsWithContent } from "@/lib/db/queries/matches";

export type PlayerDetail = {
  aliasTeams: { name: string; slug: string }[];
  canonicalSlug: string | null;
  hasPublishedContentMatch: boolean;
  id: string;
  name: string;
  position: string | null;
  slug: string;
  teamName: string;
  teamSlug: string;
};

export type PlayerMatchRow = {
  awayScore: number | null;
  awayTeamName: string;
  competitionFamily: string;
  competitionName: string;
  competitionSeason: string;
  homeScore: number | null;
  homeTeamName: string;
  isStarter: boolean;
  jerseyNumber: number;
  kickoffAt: string;
  matchId: string;
  status: string;
};

export type TeamPlayerItem = {
  name: string;
  position: string | null;
  slug: string;
};

type PlayerDetailRow = {
  canonical_player_id: string | null;
  id: string;
  name: string;
  position: string | null;
  slug: string;
  team: { name: string; slug: string } | null;
};

type PlayerLineupRow = {
  is_starter: boolean;
  jersey_number: number;
  match: {
    away_score: number | null;
    away_team: { name: string } | null;
    competition: { family: string; name: string; season: string } | null;
    home_score: number | null;
    home_team: { name: string } | null;
    id: string;
    kickoff_at: string;
    status: string;
  } | null;
};

type PlayerAliasTeamRow = {
  team: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

type PlayerIndexRow = {
  canonical_player_id: string | null;
  id: string;
  name: string;
  slug: string | null;
};

type PlayerIdRow = {
  player_id: string | null;
};

const UNRESOLVED_PLAYER_SLUG_PATTERN = /^player-[a-f0-9]{8}$/i;
const SUPABASE_PAGE_SIZE = 1000;

function firstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isResolvedPlayerSlug(slug: string | null): slug is string {
  return Boolean(slug) && !UNRESOLVED_PLAYER_SLUG_PATTERN.test(slug ?? "");
}

// 選手ページにスタッツ等の固有コンテンツが無い間は、実名選手であっても
// 検索インデックスに載せない（薄いページがクロールバジェットを食い、recap の
// インデックスを妨げるため）。feat-player-stats 実装後に true へ戻すと、
// 下の定義(b)（実名 AND published 出場 AND canonical）が復活する。
const PLAYER_PAGES_INDEXABLE = false;

export function isIndexablePlayer(
  player: Pick<
    PlayerDetail,
    "canonicalSlug" | "hasPublishedContentMatch" | "slug"
  >,
): boolean {
  if (!PLAYER_PAGES_INDEXABLE) {
    return false;
  }

  return (
    player.canonicalSlug === null &&
    player.hasPublishedContentMatch &&
    isResolvedPlayerSlug(player.slug)
  );
}

async function listPublishedContentMatchIds(): Promise<string[]> {
  return (await listMatchIdsWithContent()).map((match) => match.id);
}

async function listLineupPlayerIdsForMatchIds(
  matchIds: string[],
): Promise<string[]> {
  if (matchIds.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const playerIds = new Set<string>();

  for (const matchIdChunk of chunkArray(matchIds, 200)) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const { data, error } = await client
        .from("match_lineups")
        .select("player_id")
        .in("match_id", matchIdChunk)
        .range(from, from + SUPABASE_PAGE_SIZE - 1);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as PlayerIdRow[];

      for (const row of rows) {
        if (row.player_id) {
          playerIds.add(row.player_id);
        }
      }

      if (rows.length < SUPABASE_PAGE_SIZE) {
        break;
      }
    }
  }

  return [...playerIds];
}

async function listPlayerIndexRowsByIds(
  playerIds: string[],
): Promise<PlayerIndexRow[]> {
  if (playerIds.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const rows: PlayerIndexRow[] = [];

  for (const playerIdChunk of chunkArray(playerIds, 200)) {
    const { data, error } = await client
      .from("players")
      .select("id, name, slug, canonical_player_id")
      .in("id", playerIdChunk);

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as PlayerIndexRow[]));
  }

  return rows;
}

async function getPlayerIdsForLineupLookup(playerId: string): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select("id")
    .or(`id.eq.${playerId},canonical_player_id.eq.${playerId}`);

  if (error) {
    throw error;
  }

  const ids = (data ?? []).map((player) => player.id);

  return ids.length > 0 ? ids : [playerId];
}

async function hasPublishedContentLineup(
  playerId: string,
): Promise<boolean> {
  const [playerIds, matchIds] = await Promise.all([
    getPlayerIdsForLineupLookup(playerId),
    listPublishedContentMatchIds(),
  ]);

  if (playerIds.length === 0 || matchIds.length === 0) {
    return false;
  }

  const client = getSupabasePublicServerClient();

  for (const matchIdChunk of chunkArray(matchIds, 200)) {
    const { count, error } = await client
      .from("match_lineups")
      .select("id", { count: "exact", head: true })
      .in("player_id", playerIds)
      .in("match_id", matchIdChunk);

    if (error) {
      throw error;
    }

    if ((count ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

export async function getPlayerBySlug(
  slug: string,
): Promise<PlayerDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select(
      "id, name, slug, position, canonical_player_id, team:teams!players_team_id_fkey ( name, slug )",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as PlayerDetailRow;
  const primaryTeamSlug = row.team?.slug ?? "";
  let canonicalSlug: string | null = null;
  const aliasTeams: { name: string; slug: string }[] = [];
  let hasPublishedContentMatch = false;

  if (row.canonical_player_id) {
    const { data: canonicalData } = await client
      .from("players")
      .select("slug")
      .eq("id", row.canonical_player_id)
      .single();

    canonicalSlug = (canonicalData as { slug: string } | null)?.slug ?? null;
  } else {
    hasPublishedContentMatch = isResolvedPlayerSlug(row.slug)
      ? await hasPublishedContentLineup(row.id)
      : false;

    const { data: aliasData } = await client
      .from("players")
      .select("team:teams!players_team_id_fkey ( name, slug )")
      .eq("canonical_player_id", row.id);

    const seen = new Set<string>();

    for (const alias of (aliasData ?? []) as unknown as PlayerAliasTeamRow[]) {
      const team = firstRelation(alias.team);

      if (!team || team.slug === primaryTeamSlug || seen.has(team.slug)) {
        continue;
      }

      seen.add(team.slug);
      aliasTeams.push({ name: team.name, slug: team.slug });
    }
  }

  return {
    aliasTeams,
    canonicalSlug,
    hasPublishedContentMatch,
    id: row.id,
    name: row.name,
    position: row.position ?? null,
    slug: row.slug,
    teamName: row.team?.name ?? "",
    teamSlug: row.team?.slug ?? "",
  };
}

export async function getMatchesForPlayer(
  playerId: string,
): Promise<PlayerMatchRow[]> {
  const client = getSupabasePublicServerClient();
  const { data: aliases } = await client
    .from("players")
    .select("id")
    .or(`id.eq.${playerId},canonical_player_id.eq.${playerId}`);
  const playerIds = (aliases ?? []).map((alias) => alias.id);

  const { data, error } = await client
    .from("match_lineups")
    .select(
      `
        jersey_number,
        is_starter,
        match:matches!match_lineups_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey ( name ),
          away_team:teams!matches_away_team_id_fkey ( name ),
          competition:competitions!matches_competition_id_fkey (
            name,
            season,
            family
          )
        )
      `,
    )
    .in("player_id", playerIds.length > 0 ? playerIds : [playerId])
    .order("kickoff_at", {
      ascending: false,
      foreignTable: "matches",
    })
    .limit(30);

  if (error || !data) {
    return [];
  }

  return (data as PlayerLineupRow[]).flatMap((row) => {
    const match = row.match;

    if (!match) {
      return [];
    }

    return {
      awayScore: match.away_score,
      awayTeamName: match.away_team?.name ?? "",
      competitionFamily: match.competition?.family ?? "",
      competitionName: match.competition?.name ?? "",
      competitionSeason: match.competition?.season ?? "",
      homeScore: match.home_score,
      homeTeamName: match.home_team?.name ?? "",
      isStarter: row.is_starter,
      jerseyNumber: row.jersey_number,
      kickoffAt: match.kickoff_at,
      matchId: match.id,
      status: match.status,
    };
  });
}

export async function listAllPlayerSlugs(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select("slug")
    .is("canonical_player_id", null)
    .not("slug", "is", null);

  if (error || !data) {
    return [];
  }

  return data.map((player) => player.slug);
}

export async function listIndexablePlayerSlugs(): Promise<string[]> {
  const matchIds = await listPublishedContentMatchIds();

  if (matchIds.length === 0) {
    return [];
  }

  const lineupPlayerIds = await listLineupPlayerIdsForMatchIds(matchIds);
  const lineupPlayers = await listPlayerIndexRowsByIds(lineupPlayerIds);
  const canonicalIds = new Set(
    lineupPlayers.map((player) => player.canonical_player_id ?? player.id),
  );

  if (canonicalIds.size === 0) {
    return [];
  }

  return (await listPlayerIndexRowsByIds([...canonicalIds]))
    .filter((player) => player.canonical_player_id === null)
    .filter((player) =>
      isIndexablePlayer({
        canonicalSlug: null,
        hasPublishedContentMatch: true,
        slug: player.slug ?? "",
      }),
    )
    .map((player) => player.slug)
    .filter((slug): slug is string => Boolean(slug))
    .sort((left, right) => left.localeCompare(right));
}

export async function getPlayersByTeamSlug(
  teamSlug: string,
): Promise<TeamPlayerItem[]> {
  const client = getSupabasePublicServerClient();
  const { data: teamData } = await client
    .from("teams")
    .select("id")
    .eq("slug", teamSlug)
    .maybeSingle();

  if (!teamData) {
    return [];
  }

  const { data, error } = await client
    .from("players")
    .select("name, position, slug")
    .eq("team_id", teamData.id)
    .is("canonical_player_id", null)
    .order("name");

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    name: row.name,
    position: row.position ?? null,
    slug: row.slug,
  }));
}
