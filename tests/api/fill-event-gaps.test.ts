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
const parserMock = vi.hoisted(() => ({
  parseMatchEventsFromVeventHtml: vi.fn((_html: string) => [
    { minute: 10, playerName: "Player", teamSide: "home", type: "try" },
  ]),
}));

vi.mock("@/lib/db/server", () => dbMock);
vi.mock("@/lib/scrapers", () => fetcherMock);
vi.mock("@/lib/ingestion/events", () => eventsMock);
vi.mock("@/lib/scrapers/wikipedia-match-events", () => parserMock);

function createQuery(data: unknown[]) {
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
}

function createDb({ eventRows = [], matchRows = [] }: {
  eventRows?: unknown[];
  matchRows?: unknown[];
}) {
  const eventsQuery = createQuery(eventRows);
  const matchesQuery = createQuery(matchRows);

  return {
    eventsQuery,
    matchesQuery,
    client: {
      from: vi.fn((table: string) =>
        table === "matches" ? matchesQuery : eventsQuery,
      ),
    },
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
    const { client, matchesQuery } = createDb({});
    dbMock.getSupabaseServerClient.mockReturnValue(client);
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
    expect(matchesQuery.select).toHaveBeenCalledWith(
      "id, home_team_id, away_team_id, external_ids, kickoff_at, home_team:teams!matches_home_team_id_fkey(name, english_name), away_team:teams!matches_away_team_id_fkey(name, english_name)",
    );
    expect(matchesQuery.order).toHaveBeenCalledWith("kickoff_at", {
      ascending: false,
    });
  });

  it("does not apply the scheduled batch limit to requested match ids", async () => {
    const { client, matchesQuery } = createDb({});
    dbMock.getSupabaseServerClient.mockReturnValue(client);
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
    expect(matchesQuery.in).toHaveBeenCalledWith("id", [matchId]);
    expect(matchesQuery.limit).not.toHaveBeenCalled();
  });

  it("excludes requested matches that already have events with a candidate-limited query", async () => {
    const { client, eventsQuery } = createDb({
      eventRows: [{ match_id: "already-has-events" }],
      matchRows: [
        {
          away_team_id: "away-team",
          external_ids: { wikipedia_url: "https://example.invalid/match" },
          home_team_id: "home-team",
          id: "already-has-events",
        },
      ],
    });
    dbMock.getSupabaseServerClient.mockReturnValue(client);
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
    expect(eventsQuery.in).toHaveBeenCalledWith("match_id", [
      "already-has-events",
    ]);
  });
  it("uses the matching team and date block when the event id is mw-content-text", async () => {
    const html = `
      <div class="vevent" id="Home_v_Away">
        <span>Home national rugby union team</span>
        <span>Away national rugby union team</span>
        <span>1 February 2026</span>
        <table><tr><td>Home</td><td>Try: Player A 10'</td></tr></table>
      </div>
      <div class="vevent" id="Other_v_Teams">
        <span>Other national rugby union team</span>
        <span>Teams national rugby union team</span>
        <span>2 February 2026</span>
        <table><tr><td>Other</td><td>Try: Player B 20'</td></tr></table>
      </div>`;
    const { client } = createDb({
      matchRows: [{
        away_team: { english_name: "Away", name: "Away" },
        away_team_id: "away-team",
        external_ids: {
          wikipedia_event_id: "mw-content-text",
          wikipedia_url: "https://example.invalid/match",
        },
        home_team: { english_name: "Home", name: "Home" },
        home_team_id: "home-team",
        id: "match-block",
        kickoff_at: "2026-02-01T12:00:00Z",
      }],
    });
    dbMock.getSupabaseServerClient.mockReturnValue(client);
    fetcherMock.fetchWithPolicy.mockResolvedValue({ text: async () => html });
    parserMock.parseMatchEventsFromVeventHtml.mockClear();
    eventsMock.upsertMatchEvents.mockResolvedValue({ inserted: 1, rejected: [] });
    const { POST } = await import("@/app/api/cron/fill-event-gaps/route");

    const response = await POST(new Request("http://localhost/api/cron/fill-event-gaps", {
      headers: { Authorization: "Bearer test-cron-secret" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(parserMock.parseMatchEventsFromVeventHtml).toHaveBeenCalledTimes(1);
    const parsedBlock = parserMock.parseMatchEventsFromVeventHtml.mock.calls[0]?.[0] ?? "";
    expect(parsedBlock).toContain('id="Home_v_Away"');
    expect(parsedBlock).not.toContain('id="Other_v_Teams"');
    expect(eventsMock.upsertMatchEvents).toHaveBeenCalledTimes(1);
  });

  it("skips a page when no unique team and date block matches", async () => {
    const { client } = createDb({
      matchRows: [{
        away_team: { english_name: "Away", name: "Away" },
        away_team_id: "away-team",
        external_ids: {
          wikipedia_url: "https://example.invalid/match",
        },
        home_team: { english_name: "Home", name: "Home" },
        home_team_id: "home-team",
        id: "match-no-block",
        kickoff_at: "2026-02-01T12:00:00Z",
      }],
    });
    dbMock.getSupabaseServerClient.mockReturnValue(client);
    fetcherMock.fetchWithPolicy.mockResolvedValue({ text: async () => "<div class=vevent>Unrelated event</div>" });
    parserMock.parseMatchEventsFromVeventHtml.mockClear();
    eventsMock.upsertMatchEvents.mockClear();
    const { POST } = await import("@/app/api/cron/fill-event-gaps/route");

    const response = await POST(new Request("http://localhost/api/cron/fill-event-gaps", {
      headers: { Authorization: "Bearer test-cron-secret" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      skipped: [{ matchId: "match-no-block", reason: "no_unique_event_block" }],
    });
    expect(parserMock.parseMatchEventsFromVeventHtml).not.toHaveBeenCalled();
    expect(eventsMock.upsertMatchEvents).not.toHaveBeenCalled();
  });

});
