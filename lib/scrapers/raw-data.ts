import { getSupabaseServerClient } from "@/lib/db/server";

import type { Json } from "@/lib/db/types";

export async function saveRawData(params: {
  matchId: string;
  source: string;
  sourceUrl: string;
  payload: unknown;
}): Promise<void> {
  const client = getSupabaseServerClient();
  const { error } = await client.from("match_raw_data").insert({
    match_id: params.matchId,
    payload: params.payload as Json,
    source: params.source,
    source_url: params.sourceUrl,
  });

  if (error) {
    throw error;
  }
}
