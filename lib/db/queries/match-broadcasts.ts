import { chunkArray } from "@/lib/db/pagination";
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchBroadcastKind = "tv" | "streaming";

export type MatchBroadcast = {
  displayOrder: number;
  kind: MatchBroadcastKind;
  scope: "match" | "competition";
  serviceName: string;
  sourceUrl: string | null;
  url: string;
  verifiedAt: string;
};

export type MatchBroadcastService = Pick<
  MatchBroadcast,
  "displayOrder" | "kind" | "serviceName" | "url"
>;

type BroadcastRow = {
  display_order: number;
  kind: string;
  service_name: string;
  source_url: string | null;
  url: string;
  verified_at: string;
};

function toBroadcastKind(kind: string): MatchBroadcastKind {
  if (kind !== "tv" && kind !== "streaming") {
    throw new Error(`Unsupported match broadcast kind: ${kind}`);
  }

  return kind;
}

type MatchBroadcastRow = BroadcastRow & { match_id: string };
type CompetitionBroadcastRow = BroadcastRow & { competition_id: string };

function mapBroadcastRow(
  row: BroadcastRow,
  scope: MatchBroadcast["scope"],
): MatchBroadcast {
  return {
    displayOrder: row.display_order,
    kind: toBroadcastKind(row.kind),
    scope,
    serviceName: row.service_name,
    sourceUrl: row.source_url,
    url: row.url,
    verifiedAt: row.verified_at,
  };
}

export async function getMatchBroadcastsForMatches(
  matchIds: string[],
): Promise<Map<string, MatchBroadcast[]>> {
  if (matchIds.length === 0) {
    return new Map();
  }

  const client = getSupabasePublicServerClient();
  const broadcastsByMatch = new Map<string, MatchBroadcast[]>();
  for (const ids of chunkArray([...new Set(matchIds)], 200)) {
    const { data, error } = await client
      .from("match_broadcasts")
      .select(
        "match_id, service_name, url, kind, display_order, verified_at, source_url",
      )
      .in("match_id", ids)
      .order("display_order", { ascending: true })
      .order("service_name", { ascending: true });
    if (error) throw error;
    for (const row of (data ?? []) as MatchBroadcastRow[]) {
      const broadcasts = broadcastsByMatch.get(row.match_id) ?? [];
      broadcasts.push(mapBroadcastRow(row, "match"));
      broadcastsByMatch.set(row.match_id, broadcasts);
    }
  }

  const missingMatchIds = [...new Set(matchIds)].filter(
    (matchId) => !broadcastsByMatch.has(matchId),
  );
  if (missingMatchIds.length === 0) return broadcastsByMatch;

  try {
    const matches: Array<{
      id: string;
      competition_id: string;
      status: string;
    }> = [];
    for (const ids of chunkArray(missingMatchIds, 200)) {
      const { data, error } = await client
        .from("matches")
        .select("id, competition_id, status")
        .in("id", ids);
      if (error) throw error;
      matches.push(
        ...(data ?? []).filter((match) => match.status !== "cancelled"),
      );
    }
    const competitionIds = [
      ...new Set(matches.map((match) => match.competition_id)),
    ];
    const broadcastsByCompetition = new Map<string, MatchBroadcast[]>();
    for (const ids of chunkArray(competitionIds, 200)) {
      const { data, error } = await client
        .from("competition_broadcasts")
        .select(
          "competition_id, service_name, url, kind, display_order, verified_at, source_url",
        )
        .in("competition_id", ids)
        .order("display_order", { ascending: true })
        .order("service_name", { ascending: true });
      if (error) throw error;
      for (const row of (data ?? []) as CompetitionBroadcastRow[]) {
        const broadcasts =
          broadcastsByCompetition.get(row.competition_id) ?? [];
        broadcasts.push(mapBroadcastRow(row, "competition"));
        broadcastsByCompetition.set(row.competition_id, broadcasts);
      }
    }
    // Commit defaults only after every fallback query succeeds.
    for (const match of matches) {
      const broadcasts = broadcastsByCompetition.get(match.competition_id);
      if (broadcasts) broadcastsByMatch.set(match.id, broadcasts);
    }
  } catch (error) {
    console.error("[match-broadcasts] competition fallback failed", {
      matchIdCount: missingMatchIds.length,
      error,
    });
  }

  return broadcastsByMatch;
}

export async function getMatchBroadcastServicesForMatches(
  matchIds: string[],
): Promise<MatchBroadcastService[]> {
  const broadcastsByMatch = await getMatchBroadcastsForMatches(matchIds);
  const servicesByName = new Map<string, MatchBroadcastService>();

  for (const broadcasts of broadcastsByMatch.values()) {
    for (const broadcast of broadcasts) {
      if (!servicesByName.has(broadcast.serviceName)) {
        servicesByName.set(broadcast.serviceName, {
          displayOrder: broadcast.displayOrder,
          kind: broadcast.kind,
          serviceName: broadcast.serviceName,
          url: broadcast.url,
        });
      }
    }
  }

  return [...servicesByName.values()].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder ||
      left.serviceName.localeCompare(right.serviceName, "ja"),
  );
}

export async function getMatchBroadcastPresenceForMatches(
  matchIds: string[],
): Promise<Set<string>> {
  const broadcastsByMatch = await getMatchBroadcastsForMatches(matchIds);
  return new Set(broadcastsByMatch.keys());
}
