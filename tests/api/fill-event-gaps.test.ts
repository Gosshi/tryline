import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  client: null as unknown,
  getSupabaseServerClient: vi.fn(),
}));
const fetcherMock = vi.hoisted(() => ({
  fetchWithPolicy: vi.fn(),
}));
const eventsMock = vi.hoisted(() => ({
  upsertMatchEvents: vi.fn(),
}));

vi.mock("@/lib/db/server", () => dbMock);
vi.mock("@/lib/scrapers", () => fetcherMock);
vi.mock("@/lib/ingestion/events", () => eventsMock);

function createMatchesQuery(data: unknown[]) {
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
}

describe("/api/cron/fill-event-gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
  });

  it("returns a successful empty result without loading every match event", async () => {
    const query = createMatchesQuery([]);
    dbMock.getSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => query),
    });
    const { POST } = await import("@/app/api/cron/fill-event-gaps/route");

    const response = await POST(
      new Request("http://localhost/api/cron/fill-event-gaps", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      errors: [],
      filled: 0,
      gaps: 0,
    });
    expect(query.select).toHaveBeenCalledWith(
      "id, home_team_id, away_team_id, external_ids, match_events!left(id)",
    );
    expect(query.is).toHaveBeenCalledWith("match_events.id", null);
    expect(query.order).toHaveBeenCalledWith("kickoff_at", {
      ascending: false,
    });
  });

  it("does not apply the scheduled batch limit to requested match ids", async () => {
    const query = createMatchesQuery([]);
    dbMock.getSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => query),
    });
    const { POST } = await import("@/app/api/cron/fill-event-gaps/route");
    const matchId = "a57f18e4-5f4f-45da-99e1-12efc47e0c22";

    const response = await POST(
      new Request("http://localhost/api/cron/fill-event-gaps", {
        body: JSON.stringify({ matchIds: [matchId] }),
        headers: {
          Authorization: "Bearer test-cron-secret",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(query.in).toHaveBeenCalledWith("id", [matchId]);
    expect(query.limit).not.toHaveBeenCalled();
  });
});
