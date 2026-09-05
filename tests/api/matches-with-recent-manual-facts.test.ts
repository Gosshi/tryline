import { beforeEach, describe, expect, it, vi } from "vitest";

type FactRow = {
  match: { kickoff_at: string; status: string } | null;
  match_id: string;
};

const dbMock = vi.hoisted(() => ({
  filters: [] as Array<{ column: string; operator: string; value: unknown }>,
  rows: [] as FactRow[],
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table !== "match_sourced_facts") {
        throw new Error(`Unexpected table: ${table}`);
      }

      const result = { data: dbMock.rows, error: null };
      const query = {
        eq(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "eq", value });
          return query;
        },
        gte(column: string, value: unknown) {
          dbMock.filters.push({ column, operator: "gte", value });
          return query;
        },
        select: vi.fn(() => query),
        then: <TResult1 = typeof result, TResult2 = never>(
          onfulfilled?:
            | ((value: typeof result) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) => Promise.resolve(result).then(onfulfilled, onrejected),
      };

      return query;
    },
  }),
}));

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

function request(path: string, authorization?: string) {
  return new Request(`http://localhost${path}`, {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

function fact(
  matchId: string,
  kickoffAt: string,
  status = "finished",
): FactRow {
  return { match: { kickoff_at: kickoffAt, status }, match_id: matchId };
}

describe("/api/cron/matches-with-recent-manual-facts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T00:05:00.000Z"));
    setBaseEnv();
    dbMock.filters = [];
    dbMock.rows = [];
  });

  it("rejects missing or invalid cron authorization", async () => {
    const { GET } =
      await import("@/app/api/cron/matches-with-recent-manual-facts/route");

    const missing = await GET(
      request("/api/cron/matches-with-recent-manual-facts?content_type=recap"),
    );
    const invalid = await GET(
      request(
        "/api/cron/matches-with-recent-manual-facts?content_type=recap",
        "Bearer invalid",
      ),
    );

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("rejects invalid content types and hours", async () => {
    const { GET } =
      await import("@/app/api/cron/matches-with-recent-manual-facts/route");
    const authorization = "Bearer test-cron-secret";

    await expect(
      GET(
        request(
          "/api/cron/matches-with-recent-manual-facts?content_type=other",
          authorization,
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      GET(
        request(
          "/api/cron/matches-with-recent-manual-facts?content_type=recap&hours=0",
          authorization,
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      GET(
        request(
          "/api/cron/matches-with-recent-manual-facts?content_type=recap&hours=169",
          authorization,
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
  });

  it("uses the default 24-hour manual recap query and de-duplicates matches", async () => {
    dbMock.rows = [
      fact("match-older", "2026-09-07T10:00:00.000Z"),
      fact("match-newer", "2026-09-07T12:00:00.000Z"),
      fact("match-newer", "2026-09-07T12:00:00.000Z"),
    ];
    const { GET } =
      await import("@/app/api/cron/matches-with-recent-manual-facts/route");

    const response = await GET(
      request(
        "/api/cron/matches-with-recent-manual-facts?content_type=recap",
        "Bearer test-cron-secret",
      ),
    );

    expect(await response.json()).toEqual({
      count: 2,
      match_ids: ["match-newer", "match-older"],
      truncated: false,
    });
    expect(dbMock.filters).toEqual(
      expect.arrayContaining([
        { column: "content_type", operator: "eq", value: "recap" },
        {
          column: "metadata->>entry_method",
          operator: "eq",
          value: "manual",
        },
        {
          column: "fetched_at",
          operator: "gte",
          value: "2026-09-07T00:05:00.000Z",
        },
        { column: "match.status", operator: "eq", value: "finished" },
      ]),
    );
  });

  it("uses scheduled matches for preview requests", async () => {
    dbMock.rows = [
      fact("scheduled-match", "2026-09-09T12:00:00.000Z", "scheduled"),
    ];
    const { GET } =
      await import("@/app/api/cron/matches-with-recent-manual-facts/route");

    const response = await GET(
      request(
        "/api/cron/matches-with-recent-manual-facts?content_type=preview&hours=48",
        "Bearer test-cron-secret",
      ),
    );

    expect(response.status).toBe(200);
    expect(dbMock.filters).toEqual(
      expect.arrayContaining([
        { column: "content_type", operator: "eq", value: "preview" },
        { column: "match.status", operator: "eq", value: "scheduled" },
        {
          column: "fetched_at",
          operator: "gte",
          value: "2026-09-06T00:05:00.000Z",
        },
      ]),
    );
  });

  it("truncates to the configured maximum", async () => {
    dbMock.rows = Array.from({ length: 31 }, (_, index) =>
      fact(
        `match-${index}`,
        `2026-09-08T${String(23 - (index % 24)).padStart(2, "0")}:00:00.000Z`,
      ),
    );
    const { GET } =
      await import("@/app/api/cron/matches-with-recent-manual-facts/route");

    const response = await GET(
      request(
        "/api/cron/matches-with-recent-manual-facts?content_type=recap",
        "Bearer test-cron-secret",
      ),
    );
    const body = await response.json();

    expect(body.count).toBe(30);
    expect(body.match_ids).toHaveLength(30);
    expect(body.truncated).toBe(true);
  });
});
