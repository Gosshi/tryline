import { beforeEach, describe, expect, it, vi } from "vitest";

const reminderMock = vi.hoisted(() => ({
  discordPostStatus: 200,
  matches: [] as Array<Record<string, unknown>>,
  recaps: [] as Array<{ generated_at: string; match_id: string }>,
  tasks: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  upserts: [] as Array<{ options: unknown; rows: Array<Record<string, unknown>> }>,
}));

const envMock = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/env", () => envMock);
vi.mock("@/lib/db/server", () => dbMock);

const OWNER_ID = "123456789012345678";
const CHANNEL_ID = "234567890123456789";
const BOT_TOKEN = "test-bot-token";

function makeMatch(
  id: string,
  family = "australia-south-africa-test",
  kickoffAt = "2026-09-27T12:00:00.000Z",
  status = "scheduled",
) {
  return {
    away_team: { name: "South Africa", name_ja: "南アフリカ", slug: "south-africa" },
    competition: {
      family,
      name: family,
      name_ja: "代表戦",
      season: "2026",
    },
    home_team: { name: "Australia", name_ja: "オーストラリア", slug: "australia" },
    id,
    kickoff_at: kickoffAt,
    status,
  };
}

function makeTask(
  kind: "prematch" | "postmatch",
  overrides: Record<string, unknown> = {},
) {
  const match = makeMatch("match-1");
  return {
    discord_message_id: null,
    due_at: "2026-09-26T09:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000001",
    kind,
    match,
    match_id: match.id,
    re_reminded_at: null,
    reminded_at: null,
    resolved_at: null,
    status: "pending",
    ...overrides,
  };
}

function createBuilder(table: string) {
  const filters: Array<{ column: string; operator: string; value: unknown }> = [];
  let selected = "";
  let updatePayload: Record<string, unknown> | null = null;
  const builder = {
    delete() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, operator: "eq", value });
      return builder;
    },
    gte(column: string, value: unknown) {
      filters.push({ column, operator: "gte", value });
      return builder;
    },
    in(column: string, value: unknown) {
      filters.push({ column, operator: "in", value });
      return builder;
    },
    is(column: string, value: unknown) {
      filters.push({ column, operator: "is", value });
      return builder;
    },
    lte(column: string, value: unknown) {
      filters.push({ column, operator: "lte", value });
      return builder;
    },
    order() {
      return builder;
    },
    select(columns: string) {
      selected = columns;
      return builder;
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      return builder;
    },
    upsert(rows: Array<Record<string, unknown>>, options: unknown) {
      reminderMock.upserts.push({ options, rows });
      for (const row of rows) {
        const exists = reminderMock.tasks.some(
          (task) => task.match_id === row.match_id && task.kind === row.kind,
        );
        if (!exists) {
          const match = reminderMock.matches.find((candidate) => candidate.id === row.match_id);
          reminderMock.tasks.push({
            ...row,
            discord_message_id: null,
            id: `00000000-0000-4000-8000-${String(reminderMock.tasks.length + 1).padStart(12, "0")}`,
            match,
            re_reminded_at: null,
            reminded_at: null,
            resolved_at: null,
            status: "pending",
          });
        }
      }
      return Promise.resolve({ error: null });
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
      if (updatePayload) {
        for (const task of reminderMock.tasks) {
          const matchesFilters = filters.every(({ column, operator, value }) => {
            if (operator === "eq") return task[column] === value;
            if (operator === "is") return task[column] === value;
            return true;
          });
          if (matchesFilters) {
            Object.assign(task, updatePayload);
            reminderMock.updates.push({
              id: String(task.id),
              payload: updatePayload,
            });
          }
        }
        return Promise.resolve(resolve({ data: [], error: null }));
      }

      let data: unknown[] = [];
      if (table === "matches") {
        data = reminderMock.matches;
      } else if (table === "match_content") {
        data = reminderMock.recaps;
      } else if (table === "x_post_tasks") {
        data = reminderMock.tasks.filter((task) =>
          filters.every(({ column, operator, value }) => {
            if (operator === "eq") return task[column] === value;
            if (operator === "is") return task[column] === value;
            return true;
          }),
        );
        if (selected.includes("match:matches")) {
          data = data.filter(
            (task) => (task as Record<string, unknown>).status === "pending",
          );
        }
      }

      return Promise.resolve(resolve({ data, error: null }));
    },
  };

  return builder;
}

function createClient() {
  return {
    from: (table: string) => createBuilder(table),
  };
}

async function runCron() {
  const { GET } = await import("@/app/api/cron/x-post-reminders/route");
  return GET(
    new Request("http://localhost/api/cron/x-post-reminders", {
      headers: { Authorization: "Bearer test-cron-secret" },
    }),
  );
}

function setCredentials(overrides: Record<string, string | undefined> = {}) {
  envMock.getServerEnv.mockReturnValue({
    CRON_SECRET: "test-cron-secret",
    DISCORD_BOT_TOKEN: BOT_TOKEN,
    DISCORD_OWNER_USER_ID: OWNER_ID,
    DISCORD_X_REMINDER_CHANNEL_ID: CHANNEL_ID,
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
  vi.clearAllMocks();
  reminderMock.discordPostStatus = 200;
  reminderMock.matches = [];
  reminderMock.recaps = [];
  reminderMock.tasks = [];
  reminderMock.updates = [];
  reminderMock.upserts = [];
  setCredentials();
  dbMock.getSupabaseServerClient.mockReturnValue(createClient());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(null, { status: 204 });
      return Response.json(
        { id: "345678901234567890" },
        { status: reminderMock.discordPostStatus },
      );
    }),
  );
});

describe("GET /api/cron/x-post-reminders", () => {
  it("creates only representative tasks and upserts idempotently", async () => {
    reminderMock.matches = [
      makeMatch("international-match", "australia-south-africa-test", "2026-09-27T12:00:00.000Z"),
      makeMatch("club-match", "urc", "2026-09-27T12:00:00.000Z"),
      makeMatch("cancelled-match", "nations-championship", "2026-09-27T12:00:00.000Z", "cancelled"),
    ];
    setCredentials({ DISCORD_BOT_TOKEN: undefined });

    const first = await runCron();
    const second = await runCron();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(reminderMock.upserts).toHaveLength(2);
    expect(reminderMock.upserts[0]?.options).toEqual({
      ignoreDuplicates: true,
      onConflict: "match_id,kind",
    });
    expect(reminderMock.tasks).toHaveLength(2);
    expect(reminderMock.tasks.map((task) => [task.match_id, task.kind])).toEqual([
      ["international-match", "prematch"],
      ["international-match", "postmatch"],
    ]);
  });

  it("sends a due prematch reminder with an owner-only mention and two buttons", async () => {
    reminderMock.tasks = [
      makeTask("prematch", {
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-26T18:00:00.000Z"),
      }),
    ];
    await runCron();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const payload = JSON.parse(String(init?.body)) as {
      allowed_mentions: { users: string[] };
      components: Array<{ components: Array<{ custom_id: string; label: string; style: number; type: number }>; type: number }>;
      content: string;
    };
    expect(payload.content).toContain(`<@${OWNER_ID}>`);
    expect(payload.content).toContain("X投稿（試合前）");
    expect(payload.content).toContain("オーストラリア vs 南アフリカ");
    expect(payload.content).toContain("https://www.trylinerugby.com/matches/match-1?");
    expect(payload.allowed_mentions).toEqual({ users: [OWNER_ID] });
    expect(payload.components).toHaveLength(1);
    expect(payload.components[0]?.type).toBe(1);
    expect(payload.components[0]?.components).toEqual([
      expect.objectContaining({ custom_id: "x_post:00000000-0000-4000-8000-000000000001:posted", label: "投稿した", type: 2 }),
      expect.objectContaining({ custom_id: "x_post:00000000-0000-4000-8000-000000000001:skipped", label: "今回は見送る", type: 2 }),
    ]);
    expect(reminderMock.tasks[0]).toMatchObject({
      discord_message_id: "345678901234567890",
      reminded_at: "2026-09-26T12:00:00.000Z",
    });
  });

  it("does not send a prematch reminder before due_at", async () => {
    reminderMock.tasks = [makeTask("prematch", { due_at: "2026-09-26T12:30:00.000Z" })];
    const response = await runCron();
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(reminderMock.tasks[0]?.reminded_at).toBeNull();
  });

  it("sends one rereminder after two hours and suppresses one during JST quiet hours", async () => {
    reminderMock.tasks = [
      makeTask("prematch", {
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-27T12:00:00.000Z"),
        reminded_at: "2026-09-26T09:59:00.000Z",
      }),
    ];
    await runCron();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).content).toContain("\n【再】X投稿（試合前）");
    expect(reminderMock.tasks[0]?.re_reminded_at).toBe("2026-09-26T12:00:00.000Z");

    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-09-26T18:00:00.000Z"));
    reminderMock.tasks = [
      makeTask("prematch", {
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-27T12:00:00.000Z"),
        reminded_at: "2026-09-26T15:59:00.000Z",
      }),
    ];
    await runCron();
    expect(fetch).not.toHaveBeenCalled();
    expect(reminderMock.tasks[0]?.re_reminded_at).toBeNull();
  });

  it("does not send a second reminder when re_reminded_at is already set", async () => {
    reminderMock.tasks = [
      makeTask("postmatch", {
        reminded_at: "2026-09-26T09:59:00.000Z",
        re_reminded_at: "2026-09-26T11:59:00.000Z",
      }),
    ];
    const response = await runCron();
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks a past prematch task missed and removes existing buttons", async () => {
    reminderMock.tasks = [
      makeTask("prematch", {
        discord_message_id: "345678901234567890",
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-26T11:00:00.000Z"),
      }),
    ];
    await runCron();
    expect(reminderMock.tasks[0]).toMatchObject({
      resolved_at: "2026-09-26T12:00:00.000Z",
      status: "missed",
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/345678901234567890`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("advances postmatch due_at to the published Japanese recap and sends then", async () => {
    reminderMock.tasks = [makeTask("postmatch", { due_at: "2026-09-27T18:00:00.000Z" })];
    reminderMock.recaps = [{ match_id: "match-1", generated_at: "2026-09-26T11:30:00.000Z" }];
    await runCron();
    expect(reminderMock.tasks[0]?.due_at).toBe("2026-09-26T11:30:00.000Z");
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const content = JSON.parse(String(init?.body)).content as string;
    expect(content).toContain("X投稿（試合後）");
    expect(content).not.toContain("記事はまだありません");
  });

  it("sends a postmatch reminder without an article after the fallback due time", async () => {
    reminderMock.tasks = [makeTask("postmatch", { due_at: "2026-09-26T11:00:00.000Z" })];
    await runCron();
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).content).toContain("記事はまだありません");
  });

  it("omits the missing-article note on a postmatch rereminder after the recap is published", async () => {
    reminderMock.tasks = [
      makeTask("postmatch", {
        due_at: "2026-09-26T11:00:00.000Z",
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-26T03:00:00.000Z", "finished"),
        re_reminded_at: null,
        reminded_at: "2026-09-26T09:59:00.000Z",
      }),
    ];
    reminderMock.recaps = [{ match_id: "match-1", generated_at: "2026-09-26T11:30:00.000Z" }];

    await runCron();

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const content = JSON.parse(String(init?.body)).content as string;
    expect(content).toContain("【再】X投稿（試合後）");
    expect(content).not.toContain("記事はまだありません");
  });

  it("marks an unresolved postmatch task missed after 72 hours and removes its buttons", async () => {
    vi.setSystemTime(new Date("2026-09-29T12:01:00.000Z"));
    reminderMock.tasks = [
      makeTask("postmatch", {
        discord_message_id: "345678901234567890",
        due_at: "2026-09-26T18:00:00.000Z",
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-26T12:00:00.000Z", "finished"),
        re_reminded_at: "2026-09-26T20:00:00.000Z",
        reminded_at: "2026-09-26T18:00:00.000Z",
      }),
    ];

    await runCron();

    expect(reminderMock.tasks[0]).toMatchObject({
      resolved_at: "2026-09-29T12:01:00.000Z",
      status: "missed",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/345678901234567890`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(reminderMock.updates).toContainEqual({
      id: "00000000-0000-4000-8000-000000000001",
      payload: { resolved_at: "2026-09-29T12:01:00.000Z", status: "missed" },
    });
  });

  it("leaves an unresolved postmatch task pending at 71 hours", async () => {
    vi.setSystemTime(new Date("2026-09-29T11:00:00.000Z"));
    reminderMock.tasks = [
      makeTask("postmatch", {
        due_at: "2026-09-26T18:00:00.000Z",
        match: makeMatch("match-1", "australia-south-africa-test", "2026-09-26T12:00:00.000Z", "finished"),
        re_reminded_at: "2026-09-26T20:00:00.000Z",
        reminded_at: "2026-09-26T18:00:00.000Z",
      }),
    ];

    await runCron();

    expect(reminderMock.tasks[0]?.status).toBe("pending");
    expect(reminderMock.updates).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 500 and leaves reminded_at empty when Discord create fails", async () => {
    reminderMock.discordPostStatus = 500;
    reminderMock.tasks = [makeTask("prematch")];
    const response = await runCron();
    expect(response.status).toBe(500);
    expect(reminderMock.tasks[0]?.reminded_at).toBeNull();
  });

  it("does not deliver reminders when the owner id is missing", async () => {
    reminderMock.matches = [makeMatch("international-match")];
    setCredentials({ DISCORD_OWNER_USER_ID: undefined });
    const response = await runCron();
    expect(response.status).toBe(200);
    expect(reminderMock.tasks).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates tasks without attempting delivery when credentials are missing", async () => {
    reminderMock.matches = [makeMatch("international-match")];
    setCredentials({ DISCORD_BOT_TOKEN: undefined });
    const response = await runCron();
    expect(response.status).toBe(200);
    expect(reminderMock.tasks).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
