import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type SourcedFactCounts = {
  preview: number;
  recap: number;
};

type SourcedFactCountRow = {
  content_type: string;
};

export async function getSourcedFactCountsForMatch(
  matchId: string,
): Promise<SourcedFactCounts> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_sourced_facts")
    .select("content_type")
    .eq("match_id", matchId);

  if (error) {
    throw error;
  }

  const counts: SourcedFactCounts = {
    preview: 0,
    recap: 0,
  };

  for (const row of data satisfies SourcedFactCountRow[]) {
    if (row.content_type === "preview" || row.content_type === "recap") {
      counts[row.content_type] += 1;
    }
  }

  return counts;
}
