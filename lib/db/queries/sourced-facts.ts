import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type SourcedFactCounts = {
  preview: number;
  recap: number;
};

export type StorySourcedFact = {
  confidence: string;
  contentType: string;
  fact: string;
  factJa: string | null;
  fetchedAt: string;
  id: string;
  matchId: string;
  sourceDomain: string;
};

async function countFactsForContentType(
  matchId: string,
  contentType: "preview" | "recap",
): Promise<number> {
  const client = getSupabasePublicServerClient();
  const { count, error } = await client
    .from("match_sourced_facts")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId)
    .in("content_type", [contentType, "shared"])
    .in("confidence", ["high", "medium"]);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function getSourcedFactCountsForMatch(
  matchId: string,
): Promise<SourcedFactCounts> {
  const [preview, recap] = await Promise.all([
    countFactsForContentType(matchId, "preview"),
    countFactsForContentType(matchId, "recap"),
  ]);

  return { preview, recap };
}

export async function getStorySourcedFactsForMatches(
  matchIds: string[],
): Promise<StorySourcedFact[]> {
  if (matchIds.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_sourced_facts")
    .select(
      "id, match_id, content_type, confidence, fact, fact_ja, fetched_at, source_domain",
    )
    .in("match_id", matchIds)
    .in("content_type", ["preview", "shared"])
    .in("confidence", ["high", "medium"]);

  if (error) {
    throw error;
  }

  return (data ?? []).map((fact) => ({
    confidence: fact.confidence,
    contentType: fact.content_type,
    fact: fact.fact,
    factJa: fact.fact_ja,
    fetchedAt: fact.fetched_at,
    id: fact.id,
    matchId: fact.match_id,
    sourceDomain: fact.source_domain,
  }));
}
