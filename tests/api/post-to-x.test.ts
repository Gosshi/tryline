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
  rowsByLanguage: {
    en: [] as ContentFixture[],
    ja: [] as ContentFixture[],
  },
  updates: [] as Array<{ id: string | null; payload: Record<string, unknown> }>,
}));

const xMock = vi.hoisted(() => ({
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
        is() {
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

describe("/api/cron/post-to-x", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

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
    dbMock.rowsByLanguage.en = [];
    dbMock.rowsByLanguage.ja = [];
    dbMock.updates = [];
    xMock.postMatchRecapToX.mockResolvedValue("tweet-1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks stale previews as posted without sending them to X", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "preview",
        id: "stale-preview",
        kickoff_at: "2026-05-21T11:59:00.000Z",
        match_id: "match-1",
      }),
    ];

    const { POST } = await import("@/app/api/cron/post-to-x/route");
    const response = await POST(
      new Request("http://localhost/api/cron/post-to-x", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posted).toBe(0);
    expect(xMock.postMatchRecapToX).not.toHaveBeenCalled();
    expect(dbMock.updates).toEqual([
      {
        id: "stale-preview",
        payload: { x_posted_at: "2026-05-21T12:00:00.000Z" },
      },
    ]);
  });

  it("continues to post future previews and finished recaps", async () => {
    dbMock.rowsByLanguage.ja = [
      buildContent({
        content_type: "preview",
        id: "future-preview",
        kickoff_at: "2026-05-21T12:01:00.000Z",
        match_id: "match-2",
      }),
      buildContent({
        content_type: "recap",
        id: "finished-recap",
        kickoff_at: "2026-05-21T11:00:00.000Z",
        match_id: "match-3",
      }),
    ];

    const { POST } = await import("@/app/api/cron/post-to-x/route");
    const response = await POST(
      new Request("http://localhost/api/cron/post-to-x", {
        headers: { Authorization: "Bearer test-cron-secret" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posted).toBe(2);
    expect(xMock.postMatchRecapToX).toHaveBeenCalledTimes(2);
    expect(dbMock.updates.map((update) => update.id)).toEqual([
      "future-preview",
      "finished-recap",
    ]);
  });
});
