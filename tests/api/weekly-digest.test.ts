import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TeamFixture = {
  name: string;
  name_ja: string | null;
};

type MatchFixture = {
  away_score: number | null;
  away_team: TeamFixture;
  competition: { family: string; name_ja: string | null };
  home_score: number | null;
  home_team: TeamFixture;
  id: string;
  kickoff_at: string;
};

type MatchEventFixture = {
  match_id: string;
  metadata: { player_name?: string } | null;
  minute: number | null;
  team: TeamFixture;
  type: string;
};

type SourcedFactFixture = {
  fact: string;
  fact_ja: string | null;
  match_id: string;
};

const dbMock = vi.hoisted(() => ({
  eventRows: [] as MatchEventFixture[],
  factRows: [] as SourcedFactFixture[],
  filters: [] as Array<{
    column: string;
    operator: string;
    table: string;
    value: unknown;
  }>,
  rows: [] as MatchFixture[],
  selects: [] as Array<{ query: string; table: string }>,
}));

const openAiMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

const newsletterMock = vi.hoisted(() => ({
  sendWeeklyDigestEmails: vi.fn(),
}));

const notificationMock = vi.hoisted(() => ({
  notifyNewsletterDelivery: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      const builder = {
        eq(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "eq", table, value });
          return this;
        },
        gte(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "gte", table, value });
          return this;
        },
        in(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "in", table, value });
          return this;
        },
        lte(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "lte", table, value });
          return this;
        },
        not(column: string, operator: string, value: unknown) {
          dbMock.filters.push({
            column,
            operator: `not.${operator}`,
            table,
            value,
          });
          return this;
        },
        order() {
          return this;
        },
        select(query: string) {
          dbMock.selects.push({ query, table });
          return this;
        },
        then(
          resolve: (value: {
            data: MatchEventFixture[] | MatchFixture[] | SourcedFactFixture[];
            error: null;
          }) => void,
        ) {
          const data =
            table === "matches"
              ? dbMock.rows
              : table === "match_events"
                ? dbMock.eventRows
                : dbMock.factRows;

          return Promise.resolve(resolve({ data, error: null }));
        },
      };

      return builder;
    },
  }),
}));

vi.mock("@/lib/llm/client", () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: openAiMock.create,
      },
    },
  }),
}));

vi.mock("@/lib/newsletter", () => newsletterMock);

vi.mock("@/lib/llm/notify", () => notificationMock);

function setBaseEnv() {
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
}

function buildRequest(headers: HeadersInit = {}, method = "POST") {
  return new Request("http://localhost/api/cron/weekly-digest", {
    headers,
    method,
  });
}

function buildMatch(overrides: Partial<MatchFixture> = {}): MatchFixture {
  return {
    away_score: 17,
    away_team: { name: "France", name_ja: "フランス" },
    competition: { family: "six-nations", name_ja: "シックスネイションズ" },
    home_score: 24,
    home_team: { name: "Ireland", name_ja: "アイルランド" },
    id: "match-1",
    kickoff_at: "2026-06-20T19:00:00.000Z",
    ...overrides,
  };
}

function getUserPrompt(): string {
  const request = openAiMock.create.mock.calls[0]?.[0] as {
    messages: Array<{ content: string }>;
  };

  return request.messages[1]?.content ?? "";
}

describe("/api/cron/weekly-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));

    setBaseEnv();
    dbMock.eventRows = [];
    dbMock.factRows = [];
    dbMock.filters = [];
    dbMock.rows = [];
    dbMock.selects = [];
    openAiMock.create.mockResolvedValue({
      choices: [{ message: { content: "今週の海外ラグビーまとめ" } }],
    });
    newsletterMock.sendWeeklyDigestEmails.mockResolvedValue({
      failed: 0,
      sent: 0,
      skipped: false,
    });
    notificationMock.notifyNewsletterDelivery.mockResolvedValue(undefined);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without cron authorization", async () => {
    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(openAiMock.create).not.toHaveBeenCalled();
  });

  it("returns 401 for GET without cron authorization", async () => {
    const { GET } = await import("@/app/api/cron/weekly-digest/route");
    const response = await GET(buildRequest({}, "GET"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(openAiMock.create).not.toHaveBeenCalled();
  });

  it("sends the plain-text digest by email without posting it to Discord", async () => {
    dbMock.rows = [buildMatch()];

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const response = await POST(
      buildRequest({ Authorization: "Bearer test-cron-secret" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      matches: 1,
      newsletter: { failed: 0, sent: 0, skipped: false },
      status: "ok",
    });
    expect(openAiMock.create).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(newsletterMock.sendWeeklyDigestEmails).toHaveBeenCalledWith(
      "今週の海外ラグビーまとめ",
    );
    expect(notificationMock.notifyNewsletterDelivery).toHaveBeenCalledWith({
      failed: 0,
      sent: 0,
      skipped: false,
    });
  });

  it("skips without sending when no overseas finished matches are found", async () => {
    dbMock.rows = [
      buildMatch({
        competition: { family: "league-one", name_ja: "リーグワン" },
      }),
    ];

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const response = await POST(
      buildRequest({ Authorization: "Bearer test-cron-secret" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matches: 0, skipped: true });
    expect(openAiMock.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(dbMock.filters).toEqual(
      expect.arrayContaining([
        {
          column: "kickoff_at",
          operator: "gte",
          table: "matches",
          value: "2026-06-19T15:00:00.000Z",
        },
        {
          column: "kickoff_at",
          operator: "lte",
          table: "matches",
          value: "2026-06-21T14:59:59.999Z",
        },
      ]),
    );
    expect(dbMock.selects).toHaveLength(1);
  });

  it("passes Japanese team names, events, and recap sourced facts to the prompt", async () => {
    dbMock.rows = [buildMatch()];
    dbMock.eventRows = [
      {
        match_id: "match-1",
        metadata: { player_name: "タデイ・コリシ" },
        minute: 38,
        team: { name: "South Africa", name_ja: "南アフリカ" },
        type: "try",
      },
    ];
    dbMock.factRows = [
      {
        fact: "Pieter-Steph du Toit reached 100 caps.",
        fact_ja: "ピーター＝ステフ・デュトイが100キャップに到達した。",
        match_id: "match-1",
      },
    ];

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    await POST(buildRequest({ Authorization: "Bearer test-cron-secret" }));

    expect(getUserPrompt()).toContain("アイルランド 24–17 フランス");
    expect(getUserPrompt()).toContain("38分: 南アフリカ タデイ・コリシ try");
    expect(getUserPrompt()).toContain(
      "ピーター＝ステフ・デュトイが100キャップに到達した。",
    );
    expect(dbMock.selects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining("name, name_ja"),
          table: "matches",
        }),
        expect.objectContaining({ table: "match_events" }),
        expect.objectContaining({ table: "match_sourced_facts" }),
      ]),
    );
    expect(dbMock.filters).toContainEqual({
      column: "content_type",
      operator: "eq",
      table: "match_sourced_facts",
      value: "recap",
    });
    expect(
      dbMock.selects.some(({ query }) => query.includes("match_content")),
    ).toBe(false);
  });

  it("falls back to the English team name when name_ja is null", async () => {
    dbMock.rows = [
      buildMatch({
        away_team: { name: "New Team", name_ja: null },
      }),
    ];

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    await POST(buildRequest({ Authorization: "Bearer test-cron-secret" }));

    expect(getUserPrompt()).toContain("アイルランド 24–17 New Team");
  });

  it.each([
    ["heading", "# 今週の海外ラグビーまとめ"],
    ["link", "→ [試合レビュー](https://www.trylinerugby.com/matches/match-1)"],
    ["divider", "---"],
    ["bold", "**注目の試合**"],
  ])("rejects generated Markdown %s before sending", async (_, digest) => {
    dbMock.rows = [buildMatch()];
    openAiMock.create.mockResolvedValue({
      choices: [{ message: { content: digest } }],
    });

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const response = await POST(
      buildRequest({ Authorization: "Bearer test-cron-secret" }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
    expect(newsletterMock.sendWeeklyDigestEmails).not.toHaveBeenCalled();
    expect(notificationMock.notifyNewsletterDelivery).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the same response for authorized GET and POST requests", async () => {
    dbMock.rows = [buildMatch()];
    const { GET, POST } = await import("@/app/api/cron/weekly-digest/route");
    const headers = { Authorization: "Bearer test-cron-secret" };

    const getResponse = await GET(buildRequest(headers, "GET"));
    const postResponse = await POST(buildRequest(headers));

    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual(await postResponse.json());
    expect(openAiMock.create).toHaveBeenCalledTimes(2);
    expect(newsletterMock.sendWeeklyDigestEmails).toHaveBeenCalledTimes(2);
  });
});
