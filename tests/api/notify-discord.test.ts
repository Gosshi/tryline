import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ContentFixture = {
  content_md: string;
  content_type: "preview" | "recap";
  discord_notified_at: string | null;
  id: string;
  language: "ja" | "en";
  match_id: string;
  matches: {
    away_score: number | null;
    away_team: { english_name: string | null; name: string };
    competition: { family: string | null; name: string; season: string };
    home_score: number | null;
    home_team: { english_name: string | null; name: string };
    kickoff_at: string;
  };
  x_tweet_id: string | null;
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
  buildReplyText: vi.fn(),
  buildTweetText: vi.fn(),
  postMatchRecapToX: vi.fn(),
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
        or() {
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
    content_md: "## 見出し\n投稿本文の抜粋です。",
    content_type: overrides.content_type,
    discord_notified_at: overrides.discord_notified_at ?? null,
    id: overrides.id,
    language: overrides.language ?? "ja",
    match_id: overrides.match_id,
    matches: {
      away_score: 17,
      away_team: { english_name: "Away", name: "アウェイ" },
      competition: {
        family: "six-nations",
        name: "Test League",
        season: "2026",
      },
      home_score: 24,
      home_team: { english_name: "Home", name: "ホーム" },
      kickoff_at: overrides.kickoff_at,
    },
    x_tweet_id: overrides.x_tweet_id ?? null,
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
    xMock.buildReplyText.mockImplementation(
      (matchId: string, language: "ja" | "en") =>
        language === "en"
          ? `Full AI analysis 👇\nhttps://www.trylinerugby.com/matches/${matchId}/en`
          : `AI 戦術分析の全文はこちら 👇\nhttps://www.trylinerugby.com/matches/${matchId}`,
    );
    xMock.buildTweetText.mockReturnValue("draft tweet");
    xMock.postMatchRecapToX.mockResolvedValue("tweet-1");
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
    ) as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    expect(firstPayload.embeds[0]?.fields.map((field) => field.name)).toEqual([
      "① X に貼る（URLなし）",
      "② リプライに貼る",
      "③ 記事を開く",
    ]);
    expect(firstPayload.embeds[0]?.fields[0]?.value).toContain(
      "```\ndraft tweet\n```",
    );
    expect(firstPayload.embeds[0]?.fields[1]?.value).toContain(
      "```\nAI 戦術分析の全文はこちら 👇\nhttps://www.trylinerugby.com/matches/match-2\n```",
    );
    expect(firstPayload.embeds[0]?.fields[2]?.value).toBe(
      "https://www.trylinerugby.com/matches/match-2",
    );
    expect(xMock.buildReplyText).toHaveBeenNthCalledWith(1, "match-2", "ja");
    expect(xMock.buildReplyText).toHaveBeenNthCalledWith(2, "match-3", "en");
    expect(xMock.buildTweetText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        competitionFamily: "six-nations",
        language: "ja",
      }),
    );
    expect(xMock.buildTweetText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        competitionFamily: "six-nations",
        language: "en",
      }),
    );
    expect(dbMock.updates.map((update) => update.id)).toEqual([
      "future-preview",
      "finished-recap-en",
    ]);
    expect(xMock.postMatchRecapToX).not.toHaveBeenCalled();
  });

  it("auto-posts Japanese recaps to X and stores the tweet id", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "recap",
        id: "finished-recap-ja",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        match_id: "match-4",
      }),
    ];

    const { POST } = await import("@/app/api/cron/notify-discord/route");
    const response = await POST(
      new Request("http://localhost/api/cron/notify-discord", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(xMock.postMatchRecapToX).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "recap",
        language: "ja",
        matchId: "match-4",
      }),
    );
    expect(dbMock.updates[0]?.payload).toEqual({
      discord_notified_at: "2026-05-21T12:00:00.000Z",
      x_posted_at: "2026-05-21T12:00:00.000Z",
      x_tweet_id: "tweet-1",
    });
  });

  it("keeps Discord notification when X auto-posting fails", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "recap",
        id: "finished-recap-ja",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        match_id: "match-5",
      }),
    ];
    xMock.postMatchRecapToX.mockRejectedValueOnce(new Error("rate limited"));

    const { POST } = await import("@/app/api/cron/notify-discord/route");
    const response = await POST(
      new Request("http://localhost/api/cron/notify-discord", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(dbMock.updates[0]?.payload).toEqual({
      discord_notified_at: "2026-05-21T12:00:00.000Z",
    });
  });
});