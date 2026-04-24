import { beforeAll, describe, expect, it } from "vitest";

import { assembleMatchContentInput } from "@/lib/llm/stages/assemble";
import { ensureSupabaseTestEnvironment, insertMatchFixture } from "@/tests/db/helpers";

describe("assembleMatchContentInput", () => {
  beforeAll(() => {
    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("returns expected JSON shape for a match id", async () => {
    const { matchId } = await insertMatchFixture();

    const result = await assembleMatchContentInput(matchId);

    expect(result.match.id).toBe(matchId);
    expect(result).toHaveProperty("recent_form.home");
    expect(result).toHaveProperty("recent_form.away");
    expect(result).toHaveProperty("h2h_last_5");
    expect(result).toHaveProperty("key_stats.home.avg_points_for_last_5");
  });
});
