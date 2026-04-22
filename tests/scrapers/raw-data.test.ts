import { beforeAll, describe, expect, it } from "vitest";

import { getSupabaseServerClient } from "@/lib/db/server";
import { saveRawData } from "@/lib/scrapers/raw-data";

import { ensureSupabaseTestEnvironment, insertMatchFixture } from "../db/helpers";

describe("saveRawData", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  });

  it("inserts into match_raw_data and relies on the database default for expires_at", async () => {
    const { matchId } = await insertMatchFixture();
    const sourceUrl = `https://example.com/raw/${Date.now()}`;

    await saveRawData({
      matchId,
      payload: { html: "<html></html>" },
      source: "espn",
      sourceUrl,
    });

    const service = getSupabaseServerClient();
    const { data, error } = await service
      .from("match_raw_data")
      .select("fetched_at, expires_at, match_id, payload, source, source_url")
      .eq("source_url", sourceUrl)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      match_id: matchId,
      payload: { html: "<html></html>" },
      source: "espn",
      source_url: sourceUrl,
    });

    const fetchedAt = new Date(data!.fetched_at).getTime();
    const expiresAt = new Date(data!.expires_at).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1_000;

    expect(expiresAt - fetchedAt).toBeGreaterThanOrEqual(sevenDaysMs - 5_000);
    expect(expiresAt - fetchedAt).toBeLessThanOrEqual(sevenDaysMs + 5_000);
  });
});
