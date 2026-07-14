import { beforeEach, describe, expect, it, vi } from "vitest";

const expoMock = vi.hoisted(() => ({
  sendExpoPushNotifications: vi.fn(),
}));

const matchQueryMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));

vi.mock("@/lib/push/expo", () => expoMock);
vi.mock("@/lib/db/queries/matches", () => matchQueryMock);

type FakeMatch = {
  awayTeam: {
    name: string;
    nameJa?: string | null;
    shortCode: string;
    slug: string;
  };
  competition: {
    name: string;
    nameJa?: string | null;
    slug: string;
    season: string;
  };
  hasPreview: boolean;
  hasRecap: boolean;
  homeTeam: {
    name: string;
    nameJa?: string | null;
    shortCode: string;
    slug: string;
  };
  id: string;
  kickoffAt: string;
};

type FakeClientState = {
  contentRows?: unknown[];
  insertedLogs?: unknown[];
  loggedRows?: Array<{ kind: string; match_id: string }>;
  tokenRows?: Array<{ token: string }>;
};

function createMatch(overrides: Partial<FakeMatch> = {}): FakeMatch {
  return {
    id: "match-1",
    kickoffAt: "2026-07-18T12:40:00.000Z",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    venue: null,
    round: null,
    roundName: null,
    poolName: null,
    hasPreview: false,
    hasRecap: false,
    homeTeam: {
      name: "Japan",
      nameJa: "日本",
      shortCode: "JPN",
      slug: "japan",
    },
    awayTeam: {
      name: "France",
      nameJa: "フランス",
      shortCode: "FRA",
      slug: "france",
    },
    competition: {
      name: "Nations Championship",
      nameJa: "ネーションズチャンピオンシップ",
      slug: "nations-championship-2026",
      season: "2026",
    },
    ...overrides,
  } as FakeMatch;
}

function createFakeClient(state: FakeClientState = {}) {
  const insertedLogs: unknown[] = state.insertedLogs ?? [];
  const deletedTokens: string[][] = [];
  const tokenQueries: unknown[] = [];
  const contentQuery = {
    eq: vi.fn(() => contentQuery),
    gte: vi.fn(() => contentQuery),
    in: vi.fn(() => contentQuery),
    order: vi.fn().mockResolvedValue({
      data: state.contentRows ?? [],
      error: null,
    }),
  };
  let logInCalls = 0;
  const logQuery = {
    in: vi.fn(() => {
      logInCalls += 1;

      if (logInCalls === 1) {
        return logQuery;
      }

      return Promise.resolve({
        data: state.loggedRows ?? [],
        error: null,
      });
    }),
  };
  const tokenQuery = {
    eq: vi.fn(() => tokenQuery),
    overlaps: vi.fn().mockImplementation((column: string, value: string[]) => {
      tokenQueries.push({ column, value });

      return Promise.resolve({
        data: state.tokenRows ?? [],
        error: null,
      });
    }),
  };
  const deleteQuery = {
    in: vi.fn().mockImplementation((column: string, value: string[]) => {
      deletedTokens.push(value);

      return Promise.resolve({ error: null });
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === "push_notification_log") {
      return {
        select: vi.fn(() => logQuery),
        insert: vi.fn().mockImplementation((row) => {
          insertedLogs.push(row);

          return Promise.resolve({ error: null });
        }),
      };
    }

    if (table === "expo_push_tokens") {
      return {
        select: vi.fn(() => tokenQuery),
        delete: vi.fn(() => deleteQuery),
      };
    }

    if (table === "match_content") {
      return {
        select: vi.fn(() => contentQuery),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    deletedTokens,
    from,
    insertedLogs,
    tokenQueries,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.OPENAI_API_KEY = "test";
  process.env.SCRAPER_USER_AGENT = "tryline-test";
  process.env.VAPID_PRIVATE_KEY = "private";
  process.env.VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  process.env.WIKIPEDIA_SQUAD_URL = "https://example.com/squads";
  expoMock.sendExpoPushNotifications.mockImplementation((messages) =>
    Promise.resolve({
      deviceNotRegisteredTokens: [],
      sentCount: messages.length,
    }),
  );
});

describe("sendPrematchPushNotifications", () => {
  it("sends matching tokens, logs once, and skips an already logged rerun", async () => {
    const match = createMatch();
    const firstState: FakeClientState = {
      tokenRows: [{ token: "ExponentPushToken[token-1]" }],
    };
    const firstClient = createFakeClient(firstState);
    const { sendPrematchPushNotifications } =
      await import("@/lib/push/notifications");

    const first = await sendPrematchPushNotifications(
      [match as never],
      firstClient.client as never,
    );

    expect(first).toMatchObject({
      sentMatches: 1,
      sentNotifications: 1,
      skippedAlreadyLogged: 0,
    });
    expect(expoMock.sendExpoPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        to: "ExponentPushToken[token-1]",
        title: "まもなくキックオフ",
        body: expect.stringContaining("日本 v フランス"),
        data: { matchId: "match-1", url: "/matches/match-1" },
      }),
    ]);
    expect(firstClient.tokenQueries).toEqual([
      { column: "team_slugs", value: ["japan", "france"] },
    ]);
    expect(firstClient.insertedLogs).toEqual([
      { kind: "prematch", match_id: "match-1", sent_count: 1 },
    ]);

    expoMock.sendExpoPushNotifications.mockClear();
    const rerunClient = createFakeClient({
      loggedRows: [{ match_id: "match-1", kind: "prematch" }],
      tokenRows: [{ token: "ExponentPushToken[token-1]" }],
    });
    const rerun = await sendPrematchPushNotifications(
      [match as never],
      rerunClient.client as never,
    );

    expect(rerun).toMatchObject({
      sentMatches: 0,
      skippedAlreadyLogged: 1,
    });
    expect(expoMock.sendExpoPushNotifications).not.toHaveBeenCalled();
  });

  it("does not send to non-matching or disabled tokens returned by the DB filter", async () => {
    const client = createFakeClient({ tokenRows: [] });
    const { sendPrematchPushNotifications } =
      await import("@/lib/push/notifications");
    const summary = await sendPrematchPushNotifications(
      [createMatch() as never],
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(0);
    expect(expoMock.sendExpoPushNotifications).toHaveBeenCalledWith([]);
    expect(client.insertedLogs).toEqual([
      { kind: "prematch", match_id: "match-1", sent_count: 0 },
    ]);
  });
});

describe("sendContentPushNotifications", () => {
  it("sends preview and recap as separate log kinds without score text", async () => {
    const contentRows = [
      {
        match_id: "match-1",
        content_type: "preview",
        generated_at: "2026-07-18T00:00:00.000Z",
        match: contentMatchRow(),
      },
      {
        match_id: "match-1",
        content_type: "recap",
        generated_at: "2026-07-18T00:10:00.000Z",
        match: contentMatchRow(),
      },
    ];
    const client = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[token-1]" }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");
    const summary = await sendContentPushNotifications(
      new Date("2026-07-18T01:00:00.000Z"),
      client.client as never,
    );

    expect(summary).toMatchObject({ sentMatches: 2, sentNotifications: 2 });
    expect(client.insertedLogs).toEqual([
      { kind: "preview", match_id: "match-1", sent_count: 1 },
      { kind: "recap", match_id: "match-1", sent_count: 1 },
    ]);
    const sentMessages = expoMock.sendExpoPushNotifications.mock.calls.flatMap(
      ([messages]) => messages,
    );
    expect(sentMessages).toEqual([
      expect.objectContaining({
        title: "プレビュー公開",
        body: "プレビュー公開: 日本 v フランス",
      }),
      expect.objectContaining({
        title: "試合レビュー公開",
        body: "試合レビュー公開: 日本 v フランス（スコアは開いてから）",
      }),
    ]);
    for (const message of sentMessages) {
      expect(message.body).not.toMatch(/\d+\s*[-–]\s*\d+/);
    }
  });

  it("deletes DeviceNotRegistered tokens returned by Expo", async () => {
    expoMock.sendExpoPushNotifications.mockResolvedValue({
      deviceNotRegisteredTokens: ["ExponentPushToken[dead]"],
      sentCount: 1,
    });
    const client = createFakeClient({
      contentRows: [
        {
          match_id: "match-1",
          content_type: "recap",
          generated_at: "2026-07-18T00:00:00.000Z",
          match: contentMatchRow(),
        },
      ],
      tokenRows: [{ token: "ExponentPushToken[dead]" }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-07-18T01:00:00.000Z"),
      client.client as never,
    );

    expect(summary.deletedInvalidTokens).toBe(1);
    expect(client.deletedTokens).toEqual([["ExponentPushToken[dead]"]]);
  });

  it("does not write a log when Expo API call fails", async () => {
    expoMock.sendExpoPushNotifications.mockRejectedValue(
      new Error("expo down"),
    );
    const client = createFakeClient({
      contentRows: [
        {
          match_id: "match-1",
          content_type: "recap",
          generated_at: "2026-07-18T00:00:00.000Z",
          match: contentMatchRow(),
        },
      ],
      tokenRows: [{ token: "ExponentPushToken[token-1]" }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-07-18T01:00:00.000Z"),
      client.client as never,
    );

    expect(summary.failedMatches).toBe(1);
    expect(client.insertedLogs).toEqual([]);
  });
});

describe("push notification cron routes", () => {
  it("returns 401 without cron authorization", async () => {
    const { GET } =
      await import("@/app/api/cron/send-prematch-notifications/route");
    const response = await GET(
      new Request("http://localhost/api/cron/send-prematch-notifications"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      data: null,
      error: "unauthorized",
      success: false,
    });
  });

  it("uses the 30 to 90 minute prematch window when authorized", async () => {
    matchQueryMock.getMatchesInRange.mockResolvedValue([]);
    const { GET } =
      await import("@/app/api/cron/send-prematch-notifications/route");
    const response = await GET(
      new Request("http://localhost/api/cron/send-prematch-notifications", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledTimes(1);
  });
});

function contentMatchRow() {
  return {
    id: "match-1",
    kickoff_at: "2026-07-18T12:40:00.000Z",
    home_team: { slug: "japan", name: "Japan", name_ja: "日本" },
    away_team: { slug: "france", name: "France", name_ja: "フランス" },
    competition: {
      name: "Nations Championship",
      name_ja: "ネーションズチャンピオンシップ",
    },
  };
}
