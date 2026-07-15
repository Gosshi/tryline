import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { getMatchBroadcastsForMatches } from "@/lib/db/queries/match-broadcasts";

import type { V1MatchBroadcast } from "@/lib/api/v1/types";
import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type MobileUserProfile = {
  displayName: string | null;
  favoriteTeamSlugs: string[];
  premiumUntil: string | null;
};

export async function getBroadcastUrlsForMatches(
  matchIds: string[],
): Promise<Map<string, string | null>> {
  if (matchIds.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("matches")
    .select("id, broadcast_jp_url")
    .in("id", matchIds);

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? []).map((row) => [row.id, row.broadcast_jp_url ?? null]),
  );
}

export async function getV1BroadcastsForMatches(
  matchIds: string[],
): Promise<Map<string, V1MatchBroadcast[]>> {
  const broadcastsByMatch = await getMatchBroadcastsForMatches(matchIds);

  return new Map(
    [...broadcastsByMatch.entries()].map(([matchId, broadcasts]) => [
      matchId,
      broadcasts.map((broadcast) => ({
        kind: broadcast.kind,
        service_name: broadcast.serviceName,
        url: broadcast.url,
      })),
    ]),
  );
}

export async function getMobileUserProfile(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<MobileUserProfile | null> {
  const { data, error } = await client
    .from("user_profiles")
    .select("display_name, favorite_team_slugs, premium_until")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? {
        displayName: data.display_name,
        favoriteTeamSlugs: data.favorite_team_slugs,
        premiumUntil: data.premium_until,
      }
    : null;
}
