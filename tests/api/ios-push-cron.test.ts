import { beforeEach, describe, expect, it, vi } from "vitest";

const expoMock = vi.hoisted(() => ({
  sendExpoPushNotifications: vi.fn(),
}));

const matchQueryMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/push/expo", () => expoMock);
vi.mock("@/lib/db/queries/matches", () => matchQueryMock);
vi.mock("@/lib/db/server", () => dbMock);

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
  tokenRows?: Array<{
    notify_content?: boolean;
    notify_prematch?: boolean;
    team_slugs?: string[] | null;
    token: string;
  }>;
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
  let notificationColumn: "notify_content" | "notify_prematch" | null = null;
  const tokenQuery = {
    eq: vi.fn(
      (column: "notify_content" | "notify_prematch", value: boolean) => {
        notificationColumn = column;
        tokenQueries.push({ column, value });
        return tokenQuery;
      },
    ),
    then(
      resolve: (value: {
        data: FakeClientState["tokenRows"];
        error: null;
      }) => void,
    ) {
      return Promise.resolve(
        resolve({
          data: (state.tokenRows ?? []).filter(
            (row) =>
              notificationColumn === null || row[notificationColumn] !== false,
          ),
          error: null,
        }),
      );
    },
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
  dbMock.getSupabaseServerClient.mockImplementation(
    () => createFakeClient().client,
  );
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
      tokenRows: [
        { team_slugs: ["japan"], token: "ExponentPushToken[token-1]" },
      ],
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
      { column: "notify_prematch", value: true },
    ]);
    expect(firstClient.insertedLogs).toEqual([
      { kind: "prematch", match_id: "match-1", sent_count: 1 },
    ]);

    expoMock.sendExpoPushNotifications.mockClear();
    const rerunClient = createFakeClient({
      loggedRows: [{ match_id: "match-1", kind: "prematch" }],
      tokenRows: [
        { team_slugs: ["japan"], token: "ExponentPushToken[token-1]" },
      ],
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

  it("limits prematch notifications to three per token and logs remaining matches as zero", async () => {
    const matches = Array.from({ length: 5 }, (_, index) =>
      createMatch({
        id: `prematch-${index + 1}`,
        kickoffAt: new Date(Date.UTC(2026, 6, 18, 12, index)).toISOString(),
      }),
    );
    const client = createFakeClient({
      tokenRows: [
        { team_slugs: ["japan"], token: "ExponentPushToken[one-device]" },
      ],
    });
    const { sendPrematchPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendPrematchPushNotifications(
      matches as never,
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(3);
    expect(expoMock.sendExpoPushNotifications).toHaveBeenCalledTimes(5);
    expect(
      expoMock.sendExpoPushNotifications.mock.calls
        .slice(0, 3)
        .map(([messages]) => messages[0]?.data.matchId),
    ).toEqual(["prematch-1", "prematch-2", "prematch-3"]);
    expect(client.insertedLogs).toEqual([
      { kind: "prematch", match_id: "prematch-1", sent_count: 1 },
      { kind: "prematch", match_id: "prematch-2", sent_count: 1 },
      { kind: "prematch", match_id: "prematch-3", sent_count: 1 },
      { kind: "prematch", match_id: "prematch-4", sent_count: 0 },
      { kind: "prematch", match_id: "prematch-5", sent_count: 0 },
    ]);
  });

  it("excludes empty team slug tokens from prematch notifications", async () => {
    const client = createFakeClient({
      tokenRows: [
        { team_slugs: [], token: "ExponentPushToken[empty]" },
        { team_slugs: ["japan"], token: "ExponentPushToken[japan]" },
      ],
    });
    const { sendPrematchPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendPrematchPushNotifications(
      [createMatch() as never],
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(1);
    expect(expoMock.sendExpoPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ to: "ExponentPushToken[japan]" }),
    ]);
  });
});

describe("previewNotificationSlot", () => {
  it.each([
    ["2026-09-27T09:30:00.000Z", "2026-09-26T13:30:00.000Z"],
    ["2026-09-26T16:30:00.000Z", "2026-09-26T13:30:00.000Z"],
    ["2026-09-26T14:00:00.000Z", "2026-09-26T13:30:00.000Z"],
    ["2026-09-26T13:30:00.000Z", "2026-09-25T13:30:00.000Z"],
  ])("returns the last 22:30 JST slot before %s", async (kickoff, expected) => {
    const { previewNotificationSlot } =
      await import("@/lib/push/notifications");

    expect(previewNotificationSlot(new Date(kickoff)).toISOString()).toBe(
      expected,
    );
  });
});

describe("sendContentPushNotifications", () => {
  it("sends a recap even when now is after kickoff", async () => {
    const recapRow = {
      ...createContentRow("recap-past", "2026-09-26T10:00:00.000Z"),
      content_type: "recap",
    };
    recapRow.match.kickoff_at = "2026-09-26T09:30:00.000Z";
    const client = createFakeClient({
      contentRows: [recapRow],
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-09-27T09:30:00.000Z"),
      client.client as never,
    );

    expect(summary).toMatchObject({ sentMatches: 1, sentNotifications: 1 });
    expect(client.insertedLogs).toEqual([
      { kind: "recap", match_id: "recap-past", sent_count: 1 },
    ]);
  });

  it("defers a preview until its notification slot and sends it at the slot", async () => {
    const contentRows = [
      createContentRow("match-1", "2026-09-26T10:00:00.000Z"),
    ];
    contentRows[0]!.match.kickoff_at = "2026-09-27T09:30:00.000Z";
    const client = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const deferred = await sendContentPushNotifications(
      new Date("2026-09-26T11:30:00.000Z"),
      client.client as never,
    );

    expect(deferred).toMatchObject({ deferredPreviews: 1, sentMatches: 0 });
    expect(expoMock.sendExpoPushNotifications).not.toHaveBeenCalled();
    expect(client.insertedLogs).toEqual([]);

    const sendClient = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const sent = await sendContentPushNotifications(
      new Date("2026-09-26T13:30:00.000Z"),
      sendClient.client as never,
    );

    expect(sent).toMatchObject({ sentMatches: 1, sentNotifications: 1 });
    expect(sendClient.insertedLogs).toEqual([
      { kind: "preview", match_id: "match-1", sent_count: 1 },
    ]);
  });

  it("skips a preview after kickoff without sending or logging", async () => {
    const contentRows = [
      createContentRow("match-1", "2026-09-26T10:00:00.000Z"),
    ];
    contentRows[0]!.match.kickoff_at = "2026-09-27T09:30:00.000Z";
    const client = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-09-27T09:30:00.000Z"),
      client.client as never,
    );

    expect(summary).toMatchObject({ skippedAfterKickoff: 1, sentMatches: 0 });
    expect(expoMock.sendExpoPushNotifications).not.toHaveBeenCalled();
    expect(client.insertedLogs).toEqual([]);
  });

  it("counts an unparseable kickoff as failed without sending or logging", async () => {
    const contentRows = [
      createContentRow("match-1", "2026-09-26T10:00:00.000Z"),
    ];
    contentRows[0]!.match.kickoff_at = "not-a-date";
    const client = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-09-26T13:30:00.000Z"),
      client.client as never,
    );

    expect(summary).toMatchObject({ failedMatches: 1, sentMatches: 0 });
    expect(expoMock.sendExpoPushNotifications).not.toHaveBeenCalled();
    expect(client.insertedLogs).toEqual([]);
  });

  it("sends recaps first and eligible previews in earliest kickoff order", async () => {
    const contentRows = [
      {
        ...createContentRow("preview-late", "2026-09-26T10:00:00.000Z"),
        match: {
          ...contentMatchRow("preview-late"),
          kickoff_at: "2026-09-26T20:00:00.000Z",
        },
      },
      {
        ...createContentRow("recap-old", "2026-09-26T09:00:00.000Z"),
        content_type: "recap",
      },
      {
        ...createContentRow("preview-early", "2026-09-26T08:00:00.000Z"),
        match: {
          ...contentMatchRow("preview-early"),
          kickoff_at: "2026-09-26T14:00:00.000Z",
        },
      },
      {
        ...createContentRow("recap-new", "2026-09-26T11:00:00.000Z"),
        content_type: "recap",
      },
      {
        ...createContentRow("preview-mid", "2026-09-26T12:00:00.000Z"),
        match: {
          ...contentMatchRow("preview-mid"),
          kickoff_at: "2026-09-26T16:00:00.000Z",
        },
      },
      {
        ...createContentRow("preview-later", "2026-09-26T07:00:00.000Z"),
        match: {
          ...contentMatchRow("preview-later"),
          kickoff_at: "2026-09-26T18:00:00.000Z",
        },
      },
    ];
    const client = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-09-26T13:30:00.000Z"),
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(3);
    expect(client.insertedLogs).toEqual([
      { kind: "recap", match_id: "recap-new", sent_count: 1 },
      { kind: "recap", match_id: "recap-old", sent_count: 1 },
      { kind: "preview", match_id: "preview-early", sent_count: 1 },
      { kind: "preview", match_id: "preview-mid", sent_count: 0 },
      { kind: "preview", match_id: "preview-later", sent_count: 0 },
      { kind: "preview", match_id: "preview-late", sent_count: 0 },
    ]);
  });
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
      { kind: "recap", match_id: "match-1", sent_count: 1 },
      { kind: "preview", match_id: "match-1", sent_count: 1 },
    ]);
    const sentMessages = expoMock.sendExpoPushNotifications.mock.calls.flatMap(
      ([messages]) => messages,
    );
    expect(sentMessages).toEqual([
      expect.objectContaining({
        title: "試合レビュー公開",
        body: "試合レビュー公開: 日本 v フランス（スコアは開いてから）",
      }),
      expect.objectContaining({
        title: "プレビュー公開",
        body: "プレビュー公開: 日本 v フランス",
      }),
    ]);
    for (const message of sentMessages) {
      expect(message.body).not.toMatch(/\d+\s*[-–]\s*\d+/);
    }
  });

  it("sends the three newest articles per token and logs the rest as zero", async () => {
    const contentRows = Array.from({ length: 5 }, (_, index) =>
      createContentRow(
        `content-${index + 1}`,
        new Date(Date.UTC(2026, 6, 18, 0, index)).toISOString(),
      ),
    );
    const client = createFakeClient({
      contentRows,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-07-18T01:00:00.000Z"),
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(3);
    expect(expoMock.sendExpoPushNotifications).toHaveBeenCalledTimes(5);
    expect(
      expoMock.sendExpoPushNotifications.mock.calls
        .slice(0, 3)
        .map(([messages]) => messages[0]?.data.matchId),
    ).toEqual(["content-5", "content-4", "content-3"]);
    expect(client.insertedLogs).toEqual([
      { kind: "preview", match_id: "content-5", sent_count: 1 },
      { kind: "preview", match_id: "content-4", sent_count: 1 },
      { kind: "preview", match_id: "content-3", sent_count: 1 },
      { kind: "preview", match_id: "content-2", sent_count: 0 },
      { kind: "preview", match_id: "content-1", sent_count: 0 },
    ]);

    expoMock.sendExpoPushNotifications.mockClear();
    const rerunClient = createFakeClient({
      contentRows,
      loggedRows: client.insertedLogs as Array<{ kind: string; match_id: string }>,
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    await sendContentPushNotifications(
      new Date("2026-07-18T01:30:00.000Z"),
      rerunClient.client as never,
    );

    expect(expoMock.sendExpoPushNotifications).not.toHaveBeenCalled();
    expect(rerunClient.insertedLogs).toEqual([]);
  });

  it("applies each token's limit only to articles matching its selected teams", async () => {
    const contentRows = Array.from({ length: 8 }, (_, index) =>
      createContentRow(
        `team-content-${index + 1}`,
        new Date(Date.UTC(2026, 6, 18, 0, index)).toISOString(),
        index % 2 === 0 ? "japan" : "wales",
      ),
    );
    const client = createFakeClient({
      contentRows,
      tokenRows: [
        { token: "ExponentPushToken[japan]", team_slugs: ["japan"] },
        { token: "ExponentPushToken[wales]", team_slugs: ["wales"] },
      ],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-07-18T01:00:00.000Z"),
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(6);
    const sentMessages = expoMock.sendExpoPushNotifications.mock.calls.flatMap(
      ([messages]) => messages,
    );
    expect(sentMessages.map((message) => message.to)).toEqual([
      "ExponentPushToken[wales]",
      "ExponentPushToken[japan]",
      "ExponentPushToken[wales]",
      "ExponentPushToken[japan]",
      "ExponentPushToken[wales]",
      "ExponentPushToken[japan]",
    ]);
    expect(client.insertedLogs).toContainEqual({
      kind: "preview",
      match_id: "team-content-1",
      sent_count: 0,
    });
    expect(client.insertedLogs).toContainEqual({
      kind: "preview",
      match_id: "team-content-2",
      sent_count: 0,
    });
  });

  it("sends content notifications to empty and null team slug tokens", async () => {
    const client = createFakeClient({
      contentRows: [
        {
          match_id: "match-1",
          content_type: "preview",
          generated_at: "2026-07-18T00:00:00.000Z",
          match: contentMatchRow(),
        },
      ],
      tokenRows: [
        { team_slugs: [], token: "ExponentPushToken[empty]" },
        { team_slugs: null, token: "ExponentPushToken[null]" },
        { team_slugs: ["japan"], token: "ExponentPushToken[japan]" },
        { team_slugs: ["ireland"], token: "ExponentPushToken[ireland]" },
        {
          notify_content: false,
          team_slugs: [],
          token: "ExponentPushToken[disabled]",
        },
      ],
    });
    const { sendContentPushNotifications } =
      await import("@/lib/push/notifications");

    const summary = await sendContentPushNotifications(
      new Date("2026-07-18T01:00:00.000Z"),
      client.client as never,
    );

    expect(summary.sentNotifications).toBe(3);
    expect(expoMock.sendExpoPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({ to: "ExponentPushToken[empty]" }),
      expect.objectContaining({ to: "ExponentPushToken[null]" }),
      expect.objectContaining({ to: "ExponentPushToken[japan]" }),
    ]);
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

  it("returns 200 with the summary when content notifications succeed", async () => {
    dbMock.getSupabaseServerClient.mockReturnValue(createFakeClient().client);
    const { GET } =
      await import("@/app/api/cron/send-content-notifications/route");

    const response = await GET(
      new Request("http://localhost/api/cron/send-content-notifications", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { failedMatches: 0 },
      success: true,
    });
  });

  it("returns 500 with the content notification summary when Expo sending fails", async () => {
    const serverClient = createFakeClient({
      contentRows: [
        {
          ...createContentRow("content-1", "2026-07-18T00:00:00.000Z"),
          content_type: "recap",
        },
      ],
      tokenRows: [{ token: "ExponentPushToken[one-device]", team_slugs: [] }],
    });
    dbMock.getSupabaseServerClient.mockReturnValue(serverClient.client);
    expoMock.sendExpoPushNotifications.mockRejectedValue(
      new Error("expo unavailable"),
    );
    const { GET } =
      await import("@/app/api/cron/send-content-notifications/route");

    const response = await GET(
      new Request("http://localhost/api/cron/send-content-notifications", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      data: { failedMatches: 1 },
      error: "notification_send_failed",
      success: false,
    });
  });

  it("returns 500 with the prematch notification summary when Expo sending fails", async () => {
    const serverClient = createFakeClient({
      tokenRows: [
        { team_slugs: ["japan"], token: "ExponentPushToken[one-device]" },
      ],
    });
    dbMock.getSupabaseServerClient.mockReturnValue(serverClient.client);
    matchQueryMock.getMatchesInRange.mockResolvedValue([createMatch()]);
    expoMock.sendExpoPushNotifications.mockRejectedValue(
      new Error("expo unavailable"),
    );
    const { GET } =
      await import("@/app/api/cron/send-prematch-notifications/route");

    const response = await GET(
      new Request("http://localhost/api/cron/send-prematch-notifications", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      data: { failedMatches: 1 },
      error: "notification_send_failed",
      success: false,
    });
  });

});

function contentMatchRow(matchId = "match-1", homeTeamSlug = "japan") {
  return {
    id: matchId,
    kickoff_at: "2026-07-18T12:40:00.000Z",
    home_team: {
      slug: homeTeamSlug,
      name: homeTeamSlug === "wales" ? "Wales" : "Japan",
      name_ja: homeTeamSlug === "wales" ? "ウェールズ" : "日本",
    },
    away_team: { slug: "france", name: "France", name_ja: "フランス" },
    competition: {
      name: "Nations Championship",
      name_ja: "ネーションズチャンピオンシップ",
    },
  };
}

function createContentRow(
  matchId: string,
  generatedAt: string,
  homeTeamSlug = "japan",
) {
  return {
    match_id: matchId,
    content_type: "preview",
    generated_at: generatedAt,
    match: contentMatchRow(matchId, homeTeamSlug),
  };
}
