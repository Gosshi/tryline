import { beforeEach, describe, expect, it } from "vitest";

import { getSupabaseServerClient } from "@/lib/db/server";
import { cleanupExpiredRawData } from "@/lib/retention/cleanup-raw-data";

import { ensureSupabaseTestEnvironment, insertMatchFixture } from "../db/helpers";

describe("cleanupExpiredRawData", () => {
  beforeEach(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("deletes only rows whose expires_at is in the past and is idempotent on rerun", async () => {
    const { matchId, service } = await insertMatchFixture();
    const now = Date.now();

    const insertResult = await service.from("match_raw_data").insert([
      {
        match_id: matchId,
        source: "expired-1",
        source_url: "https://example.com/expired-1",
        payload: { html: "<html>expired-1</html>" },
        expires_at: new Date(now - 60_000).toISOString(),
      },
      {
        match_id: matchId,
        source: "expired-2",
        source_url: "https://example.com/expired-2",
        payload: { html: "<html>expired-2</html>" },
        expires_at: new Date(now - 120_000).toISOString(),
      },
      {
        match_id: matchId,
        source: "future-1",
        source_url: "https://example.com/future-1",
        payload: { html: "<html>future-1</html>" },
        expires_at: new Date(now + 60_000).toISOString(),
      },
      {
        match_id: matchId,
        source: "future-2",
        source_url: "https://example.com/future-2",
        payload: { html: "<html>future-2</html>" },
        expires_at: new Date(now + 120_000).toISOString(),
      },
    ]);

    expect(insertResult.error).toBeNull();

    const firstRun = await cleanupExpiredRawData();
    const secondRun = await cleanupExpiredRawData();
    const remainingRows = await getSupabaseServerClient()
      .from("match_raw_data")
      .select("source")
      .order("source", { ascending: true });

    expect(firstRun.deletedRows).toBe(2);
    expect(firstRun.durationMs).toBeTypeOf("number");
    expect(firstRun.durationMs).toBeGreaterThanOrEqual(0);

    expect(secondRun.deletedRows).toBe(0);
    expect(secondRun.durationMs).toBeTypeOf("number");
    expect(secondRun.durationMs).toBeGreaterThanOrEqual(0);

    expect(remainingRows.error).toBeNull();
    expect(remainingRows.data).toEqual([
      { source: "future-1" },
      { source: "future-2" },
    ]);
  });

  it("returns zero when match_raw_data is empty", async () => {
    const result = await cleanupExpiredRawData();

    expect(result).toEqual({
      deletedRows: 0,
      durationMs: expect.any(Number),
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
