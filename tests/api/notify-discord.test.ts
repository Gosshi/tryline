import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ContentFixture = {
  content_md_ja: string;
  content_type: "preview" | "recap";
  id: string;
  language: "ja" | "en";
  match_id: string;
  matches: {
    away_score: number | null;
    away_team: { english_name: string | null; name: string };
    competition: { name: string; season: string };
    home_score: number | null;
    home_team: { english_name: string | null; name: string };
    kickoff_at: string;
  };
};

const dbMock = vi.hoisted(() => ({
  filters: [] as Array<{ column: string; value: unknown }>,
  rowsByLanguage: {
    en: [] as ContentFixture[],
    ja: [] as ContentFixture[],
  },
  updates: [] as Array<{ id: string | null; payload: Record<string, unknown> }>,
}));

const xMock = vi.hoisted(() => ({
  buildTweetText: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: () => {
      const state = {
        id: null as string | null,
        language: null as "ja" | "en" | null,
        payload: null as Record<string, unknown> | null,
      };

      const builder = {
        eq(column: string, value: string) {
          if (column === "language" && (value === "ja" || value === "en")) {
            state.language = value;
          }

          if (column === "id") {
            state.id = value;
          }

          return this;
        },
        gte() {
          return this;
        },
        in() {
          return this;
        },
        is(column: string, value: unknown) {
          dbMock.filters.push({ column, value });
          return this;
        },
        limit() {
          return this;
        },
        order() {
          return this;
        },
        select() {
          return this;
        },
        then(
          resolve: (value: { data?: ContentFixture[]; error: null }) => void,
        ) {
          if (state.payload) {
            dbMock.updates.push({
              id: state.id,
              payload: state.payload,
            });
            return Promise.resolve(resolve({ error: null }));
          }

          return Promise.resolve(
            resolve({
              data: state.language
                ? dbMock.rowsByLanguage[state.language]
                : [],
              error: null,
            }),
          );
        },
        update(payload: Record<string, unknown>) {
          state.payload = payload;
          return this;
        },
      };

      return builder;
    },
  }),
}));

vi.mock("@/lib/x/post", () => xMock);

function buildContent(
  overrides: Partial<ContentFixture> & {
    content_type: "preview" | "recap";
    id: string;
    kickoff_at: string;
    match_id: string;
  },
): ContentFixture {
  return {
    content_md_ja: "## 見出し\n投稿本文の抜粋です。",
    content_type: overrides.content_type,
    id: overrides.id,
    language: overrides.language ?? "ja",
    match_id: overrides.match_id,
    matches: {
      away_score: 17,
      away_team: { english_name: "Away", name: "アウェイ" },
      competition: { name: "Test League", season: "2026" },
      home_score: 24,
      home_team: { english_name: "Home", name: "ホーム" },
      kickoff_at: overrides.kickoff_at,
    },
  };
}

describe("/api/cron/notify-discord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

    process.env.CRON_SECRET = "test-cron-secret";
    process.env.DISCORD_WEBHOOK_EN = "https://discord.com/api/webhooks/en";
    process.env.DISCORD_WEBHOOK_JA = "https://discord.com/api/webhooks/ja";
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
    dbMock.filters = [];
    dbMock.rowsByLanguage.en = [];
    dbMock.rowsByLanguage.ja = [];
    dbMock.updates = [];
    xMock.buildTweetText.mockReturnValue("draft tweet");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 204 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("marks stale previews as notified without posting to Discord", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "preview",
        id: "stale-preview",
        kickoff_at: "2026-05-21T11:59:00.000Z",
        match_id: "match-1",
      }),
    ];

    const { POST } = await import("@/app/api/cron/notify-discord/route");
    const response = await POST(
      new Request("http://localhost/api/cron/notify-discord", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notified).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(xMock.buildTweetText).not.toHaveBeenCalled();
    expect(dbMock.updates).toEqual([
      {
        id: "stale-preview",
        payload: { discord_notified_at: "2026-05-21T12:00:00.000Z" },
      },
    ]);
  });

  it("sends Japanese and English draft notifications to separate webhooks", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "preview",
        id: "future-preview",
        kickoff_at: "2026-05-21T12:01:00.000Z",
        match_id: "match-2",
      }),
    ];
    dbMock.rowsByLanguage.en = [
      buildContent({
        content_type: "recap",
        id: "finished-recap-en",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        language: "en",
        match_id: "match-3",
      }),
    ];

    const { POST } = await import("@/app/api/cron/notify-discord/route");
    const response = await POST(
      new Request("http://localhost/api/cron/notify-discord", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notified).toBe(2);
    expect(dbMock.filters).toContainEqual({
      column: "discord_notified_at",
      value: null,
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://discord.com/api/webhooks/ja",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://discord.com/api/webhooks/en",
      expect.objectContaining({ method: "POST" }),
    );
    const firstPayload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { embeds: Array<{ fields: Array<{ value: string }> }> };
    expect(firstPayload.embeds[0]?.fields[0]?.value).toContain(
      "```\ndraft tweet\n```",
    );
    expect(firstPayload.embeds[0]?.fields[1]?.value).toBe(
      "https://www.trylinerugby.com/matches/match-2",
    );
    expect(dbMock.updates.map((update) => update.id)).toEqual([
      "future-preview",
      "finished-recap-en",
    ]);
  });
});
