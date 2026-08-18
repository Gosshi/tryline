import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type MatchBroadcastKind = "tv" | "streaming";

export type MatchBroadcast = {
  displayOrder: number;
  kind: MatchBroadcastKind;
  serviceName: string;
  sourceUrl: string | null;
  url: string;
  verifiedAt: string;
};

export type MatchBroadcastService = Pick<
  MatchBroadcast,
  "displayOrder" | "kind" | "serviceName" | "url"
>;

type MatchBroadcastRow = {
  display_order: number;
  kind: string;
  match_id: string;
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

function mapBroadcastRow(row: MatchBroadcastRow): MatchBroadcast {
  return {
    displayOrder: row.display_order,
    kind: toBroadcastKind(row.kind),
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
  const { data, error } = await client
    .from("match_broadcasts")
    .select(
      "match_id, service_name, url, kind, display_order, verified_at, source_url",
    )
    .in("match_id", matchIds)
    .order("display_order", { ascending: true })
    .order("service_name", { ascending: true });

  if (error) {
    throw error;
  }

  const broadcastsByMatch = new Map<string, MatchBroadcast[]>();

  for (const row of (data ?? []) as MatchBroadcastRow[]) {
    const broadcasts = broadcastsByMatch.get(row.match_id) ?? [];
    broadcasts.push(mapBroadcastRow(row));
    broadcastsByMatch.set(row.match_id, broadcasts);
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
  if (matchIds.length === 0) {
    return new Set();
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_broadcasts")
    .select("match_id")
    .in("match_id", matchIds);

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.match_id));
}
