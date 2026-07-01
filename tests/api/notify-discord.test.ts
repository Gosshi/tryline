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
    away_team: {
      english_name: string | null;
      name: string;
      name_ja: string | null;
    };
    competition: {
      family: string | null;
      name: string;
      name_ja: string | null;
      season: string;
    };
    home_score: number | null;
    home_team: {
      english_name: string | null;
      name: string;
      name_ja: string | null;
    };
    kickoff_at: string;
  };
  x_tweet_id: string | null;
};

type EventFixture = {
  metadata: { player_name?: string };
  type: string;
};

const dbMock = vi.hoisted(() => ({
  eventsByMatch: {} as Record<string, EventFixture[]>,
  filters: [] as Array<{ column: string; value: unknown }>,
  ors: [] as string[],
  rowsByLanguage: {
    en: [] as ContentFixture[],
    ja: [] as ContentFixture[],
  },
  updates: [] as Array<{ id: string | null; payload: Record<string, unknown> }>,
}));

const xMock = vi.hoisted(() => ({
  HASHTAGS_BY_FAMILY: {
    "six-nations": {
      en: "#SixNations #Rugby",
      ja: "#シックスネーションズ #ラグビー",
    },
  },
  buildLinklessReplyText: vi.fn(),
  buildReplyText: vi.fn(),
  buildTweetText: vi.fn(),
  postMatchRecapToX: vi.fn(),
}));

const impressionMock = vi.hoisted(() => ({
  generateImpressionTweet: vi.fn(),
}));

const previewThreadMock = vi.hoisted(() => ({
  generatePreviewThread: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      const state = {
        id: null as string | null,
        language: null as "ja" | "en" | null,
        matchId: null as string | null,
        payload: null as Record<string, unknown> | null,
        type: null as string | null,
      };

      const builder = {
        eq(column: string, value: string) {
          if (column === "language" && (value === "ja" || value === "en")) {
            state.language = value;
          }

          if (column === "id") {
            state.id = value;
          }

          if (column === "match_id") {
            state.matchId = value;
          }

          if (column === "type") {
            state.type = value;
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
        or(condition: string) {
          dbMock.ors.push(condition);
          return this;
        },
        select() {
          return this;
        },
        then(
          resolve: (value: {
            data?: ContentFixture[] | EventFixture[];
            error: null;
          }) => void,
        ) {
          if (state.payload) {
            dbMock.updates.push({
              id: state.id,
              payload: state.payload,
            });
            return Promise.resolve(resolve({ error: null }));
          }

          if (table === "match_events") {
            const events = state.matchId
              ? (dbMock.eventsByMatch[state.matchId] ?? [])
              : [];
            return Promise.resolve(
              resolve({
                data: state.type
                  ? events.filter((event) => event.type === state.type)
                  : events,
                error: null,
              }),
            );
          }

          return Promise.resolve(
            resolve({
              data: state.language ? dbMock.rowsByLanguage[state.language] : [],
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

vi.mock("@/lib/x/impression-tweet", () => impressionMock);
vi.mock("@/lib/x/post", () => xMock);
vi.mock("@/lib/x/preview-thread", () => previewThreadMock);

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
      away_team: { english_name: "Away", name: "Away", name_ja: "アウェイ" },
      competition: {
        family: "six-nations",
        name: "Test League",
        name_ja: "テストリーグ",
        season: "2026",
      },
      home_score: 24,
      home_team: { english_name: "Home", name: "Home", name_ja: "ホーム" },
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
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.trylinerugby.com";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_SUBJECT = "";
    process.env.WIKIPEDIA_SQUAD_URL =
      "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";
    dbMock.filters = [];
    dbMock.eventsByMatch = {};
    dbMock.ors = [];
    dbMock.rowsByLanguage.en = [];
    dbMock.rowsByLanguage.ja = [];
    dbMock.updates = [];
    xMock.buildLinklessReplyText.mockImplementation(
      (language: "ja" | "en", contentType: "preview" | "recap") =>
        language === "en"
          ? `${contentType} is available on Tryline.\nOpen it from the article URL or profile link.`
          : `${contentType === "preview" ? "プレビュー" : "レビュー全文"}はTrylineで公開しています。\n記事URLまたはプロフィールのリンクからどうぞ。`,
    );
    xMock.buildTweetText.mockReturnValue("draft tweet");
    xMock.postMatchRecapToX.mockResolvedValue("tweet-1");
    impressionMock.generateImpressionTweet.mockResolvedValue(
      "最後まで目が離せない好ゲームだった。山田の2トライが効いたなあ #ラグビー",
    );
    previewThreadMock.generatePreviewThread.mockResolvedValue({
      tweet1: "ホームの接点支配はアウェイの速攻を止められるか？",
      tweet2: "- 接点の優位\n- キック裏の攻防\n- 終盤の規律 #ラグビー",
      tweet3:
        "プレビューはTrylineで公開しています。\n記事URLまたはプロフィールのリンクからどうぞ。",
    });
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
    expect(dbMock.ors).toEqual([]);
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
      "② リプライ案（URLなし）",
      "③ 記事URL（必要なら本投稿に追加）",
      "⑤ プレビュースレッド案（手動投稿用）",
    ]);
    expect(firstPayload.embeds[0]?.fields[0]?.value).toContain(
      "```\ndraft tweet\n```",
    );
    expect(firstPayload.embeds[0]?.fields[1]?.value).toContain(
      "```\nプレビューはTrylineで公開しています。\n記事URLまたはプロフィールのリンクからどうぞ。\n```",
    );
    expect(firstPayload.embeds[0]?.fields[2]?.value).toBe(
      "https://www.trylinerugby.com/matches/match-2?utm_source=x&utm_medium=social&utm_campaign=preview&utm_content=match-2",
    );
    expect(firstPayload.embeds[0]?.fields[3]?.value).toContain("🐦 ツイート1");
    expect(firstPayload.embeds[0]?.fields[3]?.value).toContain(
      "ホームの接点支配",
    );
    expect(firstPayload.embeds[0]?.fields[3]?.value).toContain(
      "プレビューはTrylineで公開しています。",
    );
    expect(xMock.buildLinklessReplyText).toHaveBeenNthCalledWith(
      1,
      "ja",
      "preview",
    );
    expect(xMock.buildLinklessReplyText).toHaveBeenNthCalledWith(
      2,
      "en",
      "recap",
    );
    expect(xMock.buildTweetText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        competitionFamily: "six-nations",
        competitionLabel: "テストリーグ",
        awayTeamName: "アウェイ",
        homeTeamName: "ホーム",
        language: "ja",
      }),
    );
    expect(xMock.buildTweetText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        competitionFamily: "six-nations",
        competitionLabel: "Test League",
        awayTeamName: "Away",
        homeTeamName: "Home",
        language: "en",
      }),
    );
    expect(impressionMock.generateImpressionTweet).toHaveBeenCalledTimes(1);
    expect(previewThreadMock.generatePreviewThread).toHaveBeenCalledTimes(1);
    expect(previewThreadMock.generatePreviewThread).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeamName: "アウェイ",
        competitionFamily: "six-nations",
        competitionLabel: "テストリーグ",
        homeTeamName: "ホーム",
        matchId: "match-2",
        previewMarkdown: "## 見出し\n投稿本文の抜粋です。",
      }),
    );
    expect(dbMock.updates.map((update) => update.id)).toEqual([
      "future-preview",
      "finished-recap-en",
    ]);
    expect(xMock.postMatchRecapToX).not.toHaveBeenCalled();
  });

  it("sends Japanese recap drafts without auto-posting to X", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "recap",
        id: "finished-recap-ja",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        match_id: "match-4",
      }),
    ];
    dbMock.eventsByMatch["match-4"] = [
      { metadata: { player_name: "山田太郎" }, type: "try" },
      { metadata: { player_name: "山田太郎" }, type: "try" },
      { metadata: { player_name: "佐藤次郎" }, type: "try" },
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
    const payload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    expect(payload.embeds[0]?.fields[3]).toEqual(
      expect.objectContaining({
        inline: false,
        name: "④ 公式へのリプライ案 🇯🇵",
        value: expect.stringContaining("山田太郎が2トライ"),
      }),
    );
    expect(payload.embeds[0]?.fields[3]?.value).toContain("ホーム 24-17。");
    expect(payload.embeds[0]?.fields[3]?.value).toContain("佐藤次郎がトライ");
    expect(payload.embeds[0]?.fields[4]).toEqual(
      expect.objectContaining({
        inline: false,
        name: "⑤ 公式へのリプライ案 🇬🇧",
        value: expect.stringContaining("Home 24-17 Away."),
      }),
    );
    expect(payload.embeds[0]?.fields[5]).toEqual(
      expect.objectContaining({
        inline: false,
        name: "⑥ 読みどころ投稿案（URLなし）",
        value: expect.stringContaining("最後まで目が離せない好ゲーム"),
      }),
    );
    expect(impressionMock.generateImpressionTweet).toHaveBeenCalledWith(
      expect.objectContaining({
        awayScore: 17,
        competitionLabel: "テストリーグ",
        awayTeamName: "アウェイ",
        homeScore: 24,
        homeTeamName: "ホーム",
        tryScorers: [
          { count: 2, playerName: "山田太郎" },
          { count: 1, playerName: "佐藤次郎" },
        ],
      }),
    );
    expect(previewThreadMock.generatePreviewThread).not.toHaveBeenCalled();
    expect(xMock.postMatchRecapToX).not.toHaveBeenCalled();
    expect(dbMock.updates[0]?.payload).toEqual({
      discord_notified_at: "2026-05-21T12:00:00.000Z",
    });
  });

  it("falls back to canonical names when Japanese display names are missing", async () => {
    const fallbackContent = buildContent({
      content_type: "preview",
      id: "future-preview-fallback",
      kickoff_at: "2026-05-21T12:01:00.000Z",
      match_id: "match-fallback",
    });
    fallbackContent.matches.home_team = {
      english_name: null,
      name: "Home Fallback",
      name_ja: null,
    };
    fallbackContent.matches.away_team = {
      english_name: null,
      name: "Away Fallback",
      name_ja: null,
    };
    fallbackContent.matches.competition = {
      family: "six-nations",
      name: "Fallback League",
      name_ja: null,
      season: "2026",
    };
    dbMock.rowsByLanguage.ja = [fallbackContent];

    const { POST } = await import("@/app/api/cron/notify-discord/route");
    const response = await POST(
      new Request("http://localhost/api/cron/notify-discord", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(xMock.buildTweetText).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeamName: "Away Fallback",
        competitionLabel: "Fallback League",
        homeTeamName: "Home Fallback",
        language: "ja",
      }),
    );
    expect(previewThreadMock.generatePreviewThread).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeamName: "Away Fallback",
        competitionLabel: "Fallback League",
        homeTeamName: "Home Fallback",
      }),
    );
  });

  it("omits the impression tweet field when generation fails", async () => {
    impressionMock.generateImpressionTweet.mockResolvedValueOnce(null);
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "recap",
        id: "finished-recap-no-impression",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        match_id: "match-no-impression",
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
    const payload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { embeds: Array<{ fields: Array<{ name: string }> }> };
    expect(payload.embeds[0]?.fields.map((field) => field.name)).not.toContain(
      "⑥ 読みどころ投稿案（URLなし）",
    );
  });

  it("omits the preview thread field when generation fails", async () => {
    previewThreadMock.generatePreviewThread.mockResolvedValueOnce(null);
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "preview",
        id: "future-preview-no-thread",
        kickoff_at: "2026-05-21T12:01:00.000Z",
        match_id: "match-no-thread",
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
    const payload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { embeds: Array<{ fields: Array<{ name: string }> }> };
    expect(payload.embeds[0]?.fields.map((field) => field.name)).not.toContain(
      "⑤ プレビュースレッド案（手動投稿用）",
    );
  });

  it("keeps official reply draft fields within the Discord value limit", async () => {
    const longName = "長い選手名".repeat(220);
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "recap",
        id: "finished-recap-long",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        match_id: "match-long",
      }),
    ];
    dbMock.eventsByMatch["match-long"] = [
      { metadata: { player_name: longName }, type: "try" },
    ];

    const { POST } = await import("@/app/api/cron/notify-discord/route");
    const response = await POST(
      new Request("http://localhost/api/cron/notify-discord", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    const payload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body as string,
    ) as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    const officialFields = payload.embeds[0]?.fields.slice(3, 5) ?? [];
    expect(officialFields.map((field) => field.name)).toEqual([
      "④ 公式へのリプライ案 🇯🇵",
      "⑤ 公式へのリプライ案 🇬🇧",
    ]);
    expect(officialFields.every((field) => field.value.length <= 1024)).toBe(
      true,
    );
  });

  it("does not attempt X auto-posting for Japanese recaps", async () => {
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
    expect(xMock.postMatchRecapToX).not.toHaveBeenCalled();
    expect(dbMock.updates[0]?.payload).toEqual({
      discord_notified_at: "2026-05-21T12:00:00.000Z",
    });
  });
});
