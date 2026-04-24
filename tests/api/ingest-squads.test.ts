import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServiceClient, ensureSupabaseTestEnvironment } from "@/tests/db/helpers";

const squadsMock = vi.hoisted(() => ({
  scrapeSquads: vi.fn(),
}));

vi.mock("@/lib/scrapers/wikipedia-squads", () => squadsMock);

describe("/api/cron/ingest-squads", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { API_URL, SERVICE_ROLE_KEY } = ensureSupabaseTestEnvironment();

    process.env.NEXT_PUBLIC_SUPABASE_URL = API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.WIKIPEDIA_SQUAD_URL = "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";

    const service = createServiceClient();
    await service.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await service.from("teams").delete().in("slug", ["england", "france"]);
    const { error } = await service.from("teams").insert([
      { slug: "england", name: "England", country: "ENG" },
      { slug: "france", name: "France", country: "FRA" },
    ]);
    if (error) throw error;
  });

  it("returns 401 without bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-squads/route");
    const response = await POST(new Request("http://localhost/api/cron/ingest-squads", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(squadsMock.scrapeSquads).not.toHaveBeenCalled();
  });

  it("upserts players and returns 200", async () => {
    squadsMock.scrapeSquads.mockResolvedValue([
      { team_slug: "england", name: "Player One", position: "FH", caps: 10, date_of_birth: "2000-01-01" },
      { team_slug: "france", name: "Player Two", position: "SH", caps: 20, date_of_birth: "1999-01-01" },
    ]);

    const { POST } = await import("@/app/api/cron/ingest-squads/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-squads", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ upserted: 2, skipped_teams: [], no_data: false });

    const service = createServiceClient();
    const { data, error } = await service.from("players").select("name").in("name", ["Player One", "Player Two"]);

    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
