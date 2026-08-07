import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MatchFixture = {
  away_score: number | null;
  away_team: { name: string };
  competition: { family: string; name_ja: string };
  home_score: number | null;
  home_team: { name: string };
  id: string;
  kickoff_at: string;
};

const dbMock = vi.hoisted(() => ({
  filters: [] as Array<{ column: string; operator: string; value: unknown }>,
  rows: [] as MatchFixture[],
}));

const openAiMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const builder = {
        gte(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "gte", value });
          return this;
        },
        lte(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "lte", value });
          return this;
        },
        not(column: string, operator: string, value: unknown) {
          dbMock.filters.push({ column, operator: `not.${operator}`, value });
          return this;
        },
        order() {
          return this;
        },
        select() {
          return this;
        },
        then(
          resolve: (value: { data: MatchFixture[]; error: null }) => void,
        ) {
          return Promise.resolve(resolve({ data: dbMock.rows, error: null }));
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

function setBaseEnv() {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.DISCORD_WEBHOOK_WEEKLY_DIGEST =
    "https://discord.com/api/webhooks/weekly";
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

function buildRequest(headers: HeadersInit = {}) {
  return new Request("http://localhost/api/cron/weekly-digest", {
    headers,
    method: "POST",
  });
}

function buildMatch(overrides: Partial<MatchFixture> = {}): MatchFixture {
  return {
    away_score: 17,
    away_team: { name: "France" },
    competition: { family: "six-nations", name_ja: "シックスネイションズ" },
    home_score: 24,
    home_team: { name: "Ireland" },
    id: "match-1",
    kickoff_at: "2026-06-20T19:00:00.000Z",
    ...overrides,
  };
}

describe("/api/cron/weekly-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));

    setBaseEnv();
    dbMock.filters = [];
    dbMock.rows = [];
    openAiMock.create.mockResolvedValue({
      choices: [{ message: { content: "# 【今週の海外ラグビーまとめ】" } }],
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
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

  it("skips when the weekly digest webhook is not configured", async () => {
    delete process.env.DISCORD_WEBHOOK_WEEKLY_DIGEST;

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const response = await POST(
      buildRequest({ Authorization: "Bearer test-cron-secret" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ reason: "no_webhook", skipped: true });
    expect(openAiMock.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
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
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ matches: 0, skipped: true });
    expect(openAiMock.create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(dbMock.filters).toEqual(
      expect.arrayContaining([
        {
          column: "kickoff_at",
          operator: "gte",
          value: "2026-06-19T15:00:00.000Z",
        },
        {
          column: "kickoff_at",
          operator: "lte",
          value: "2026-06-21T14:59:59.999Z",
        },
      ]),
    );
  });

  it("generates a single digest and posts split Discord messages", async () => {
    dbMock.rows = [
      buildMatch(),
      buildMatch({
        competition: { family: "league-one", name_ja: "リーグワン" },
        id: "league-one-match",
      }),
    ];
    openAiMock.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: `${"a".repeat(1900)}\n${"b".repeat(20)}`,
          },
        },
      ],
    });

    const { POST } = await import("@/app/api/cron/weekly-digest/route");
    const response = await POST(
      buildRequest({ Authorization: "Bearer test-cron-secret" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ chunks: 2, matches: 1, status: "ok" });
    expect(openAiMock.create).toHaveBeenCalledTimes(1);
    expect(openAiMock.create.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5.6-terra",
    });
    expect(openAiMock.create.mock.calls[0]?.[0].messages[1].content).toContain(
      "Ireland 24–17 France",
    );
    expect(openAiMock.create.mock.calls[0]?.[0].messages[1].content).not.toContain(
      "league-one-match",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const firstPayload = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    );
    expect(firstPayload).toMatchObject({
      content: expect.stringContaining("📋 note 原稿（コピペ用）"),
    });
  });
});
