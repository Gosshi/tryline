import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ContentRow = {
  generated_at: string;
  match: { kickoff_at: string; status: string } | null;
  match_id: string;
};

type LineupRow = {
  created_at: string;
  match_id: string;
  updated_at: string;
};

const dbMock = vi.hoisted(() => ({
  contentError: null as Error | null,
  contentFilters: [] as Array<{ column: string; operator: string; value: unknown }>,
  contentRows: [] as ContentRow[],
  lineupMatchIds: [] as string[],
  lineupRows: [] as LineupRow[],
}));

function createQuery<T>(
  rows: T[],
  filters: Array<{ column: string; operator: string; value: unknown }>,
  error: Error | null = null,
) {
  const result = { data: rows, error };
  const query = {
    eq(column: string, value: unknown) {
      filters.push({ column, operator: "eq", value });
      return query;
    },
    gt(column: string, value: unknown) {
      filters.push({ column, operator: "gt", value });
      return query;
    },
    in(column: string, value: unknown) {
      filters.push({ column, operator: "in", value });
      return query;
    },
    lt(column: string, value: unknown) {
      filters.push({ column, operator: "lt", value });
      return query;
    },
    select: vi.fn(() => query),
    then: <TResult1 = typeof result, TResult2 = never>(
      onfulfilled?:
        | ((value: typeof result) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };

  return query;
}

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "match_content") {
        return createQuery(
          dbMock.contentRows,
          dbMock.contentFilters,
          dbMock.contentError,
        );
      }

      if (table === "match_lineups") {
        return createQuery(dbMock.lineupRows, [
          {
            column: "match_id",
            operator: "in",
            value: dbMock.lineupMatchIds,
          },
        ]);
      }

      throw new Error(`Unexpected table: ${table}`);
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

function content(
  matchId: string,
  kickoffAt: string,
  generatedAt = "2026-09-11T10:00:00.000Z",
): ContentRow {
  return {
    generated_at: generatedAt,
    match: { kickoff_at: kickoffAt, status: "scheduled" },
    match_id: matchId,
  };
}

function lineup(
  matchId: string,
  createdAt: string,
  updatedAt: string,
): LineupRow {
  return { created_at: createdAt, match_id: matchId, updated_at: updatedAt };
}

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/matches-with-late-lineups", {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

describe("/api/cron/matches-with-late-lineups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:05:00.000Z"));
    setBaseEnv();
    dbMock.contentFilters = [];
    dbMock.contentError = null;
    dbMock.contentRows = [];
    dbMock.lineupMatchIds = [];
    dbMock.lineupRows = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without cron authorization", async () => {
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    await expect(GET(request())).resolves.toMatchObject({ status: 401 });
  });

  it("returns 500 when the preview content query fails", async () => {
    dbMock.contentError = new Error("database unavailable");
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    const response = await GET(request("Bearer test-cron-secret"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch matches with late lineups",
    });
  });

  it("includes a match whose lineup was added after preview generation", async () => {
    dbMock.contentRows = [content("late-lineup", "2026-09-12T12:00:00.000Z")];
    dbMock.lineupRows = [
      lineup(
        "late-lineup",
        "2026-09-11T10:30:00.000Z",
        "2026-09-11T10:30:00.000Z",
      ),
    ];
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    const response = await GET(request("Bearer test-cron-secret"));

    expect(await response.json()).toEqual({
      count: 1,
      match_ids: ["late-lineup"],
      truncated: false,
    });
    expect(dbMock.contentFilters).toEqual(
      expect.arrayContaining([
        { column: "match.status", operator: "eq", value: "scheduled" },
        {
          column: "match.kickoff_at",
          operator: "gt",
          value: "2026-09-11T12:05:00.000Z",
        },
        {
          column: "match.kickoff_at",
          operator: "lt",
          value: "2026-09-12T15:00:00.000Z",
        },
      ]),
    );
  });

  it("includes a lineup updated after preview generation when it was created earlier", async () => {
    dbMock.contentRows = [content("updated-lineup", "2026-09-12T12:00:00.000Z")];
    dbMock.lineupRows = [
      lineup(
        "updated-lineup",
        "2026-09-10T10:00:00.000Z",
        "2026-09-11T10:30:00.000Z",
      ),
    ];
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    const response = await GET(request("Bearer test-cron-secret"));

    await expect(response.json()).resolves.toMatchObject({
      match_ids: ["updated-lineup"],
    });
  });

  it("excludes a match generated after its latest lineup update", async () => {
    dbMock.contentRows = [content("current-preview", "2026-09-12T12:00:00.000Z")];
    dbMock.lineupRows = [
      lineup(
        "current-preview",
        "2026-09-11T09:00:00.000Z",
        "2026-09-11T09:30:00.000Z",
      ),
    ];
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    const response = await GET(request("Bearer test-cron-secret"));

    await expect(response.json()).resolves.toEqual({
      count: 0,
      match_ids: [],
      truncated: false,
    });
  });

  it("excludes a match without preview content", async () => {
    dbMock.lineupRows = [
      lineup(
        "no-preview",
        "2026-09-11T10:30:00.000Z",
        "2026-09-11T10:30:00.000Z",
      ),
    ];
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    const response = await GET(request("Bearer test-cron-secret"));

    await expect(response.json()).resolves.toEqual({
      count: 0,
      match_ids: [],
      truncated: false,
    });
  });

  it("caps late lineups at 30 in ascending kickoff order", async () => {
    dbMock.contentRows = Array.from({ length: 31 }, (_, index) =>
      content(
        `match-${index}`,
        `2026-09-${String(12 + Math.floor(index / 24)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
      ),
    ).reverse();
    dbMock.lineupRows = Array.from({ length: 31 }, (_, index) =>
      lineup(
        `match-${index}`,
        "2026-09-11T10:00:00.000Z",
        "2026-09-11T10:30:00.000Z",
      ),
    );
    const { GET } = await import(
      "@/app/api/cron/matches-with-late-lineups/route"
    );

    const response = await GET(request("Bearer test-cron-secret"));
    const body = await response.json();

    expect(body).toMatchObject({ count: 30, truncated: true });
    expect(body.match_ids).toEqual(
      Array.from({ length: 30 }, (_, index) => `match-${index}`),
    );
  });
});
