import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type SourcedFactCounts = {
  preview: number;
  recap: number;
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
