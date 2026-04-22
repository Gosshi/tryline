import { beforeAll, describe, expect, it } from "vitest";

import { ensureSupabaseTestEnvironment } from "./db/helpers";
import { GET } from "../app/api/health/route";

describe("/api/health", () => {
  beforeAll(() => {
    const { ANON_KEY, API_URL } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.OPENAI_API_KEY = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  });

  it("returns 200 when the competitions table is reachable via Supabase", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.supabase).toBe("ok");
  });
});
