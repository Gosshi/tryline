import { getSupabaseServerClient } from "@/lib/db/server";

export async function cleanupExpiredRawData(): Promise<{
  deletedRows: number;
  durationMs: number;
}> {
  const startedAt = Date.now();
  const client = getSupabaseServerClient();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("match_raw_data")
    .delete()
    .lt("expires_at", now)
    .select("id");

  if (error) {
    throw error;
  }

  const deletedRows = data?.length ?? 0;
  const durationMs = Date.now() - startedAt;

  console.info(
    "[cleanup-raw-data] deleted=%d duration_ms=%d",
    deletedRows,
    durationMs,
  );

  return {
    deletedRows,
    durationMs,
  };
}
