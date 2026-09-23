import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => {
  class CronUnauthorizedError extends Error {}

  return {
    CronUnauthorizedError,
    assertCronAuthorized: vi.fn(),
  };
});
const fetchWikipediaMock = vi.hoisted(() => ({
  fetchWikipediaWikitext: vi.fn(),
}));
const notifyMock = vi.hoisted(() => ({
  notifyMissingInternationals: vi.fn(),
}));
const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));
const queryCalls: Array<{ method: string; table: string; args: unknown[] }> = [];
let rowsByTable: Record<string, unknown[]>;

vi.mock("@/lib/cron/auth", () => authMock);
vi.mock("@/lib/ingestion/sources/wikipedia-wikitext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ingestion/sources/wikipedia-wikitext")>();

  return { ...actual, ...fetchWikipediaMock };
});
vi.mock("@/lib/llm/notify", () => notifyMock);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));

import { POST } from "@/app/api/cron/audit-missing-internationals/route";
import { FetchError } from "@/lib/scrapers/errors";

const REAL_WIKITEXT = readFileSync(
  "tests/fixtures/wikipedia-2026-mens-rugby-union-internationals.wiki",
  "utf8",
);
const NATIONAL_TEAMS = [
  {
    id: "team-aus",
    name: "Australia",
    name_ja: "オーストラリア",
    short_code: "AUS",
  },
  {
    id: "team-nzl",
    name: "New Zealand",
    name_ja: "ニュージーランド",
    short_code: "NZL",
  },
  {
    id: "team-rsa",
    name: "South Africa",
    name_ja: "南アフリカ",
    short_code: "RSA",
  },
];

function createQuery(table: string) {
  const result = { data: rowsByTable[table] ?? [], error: null };
  const query = {
    eq: vi.fn((...args: unknown[]) => {
      queryCalls.push({ args, method: "eq", table });
      return query;
    }),
    gte: vi.fn((...args: unknown[]) => {
      queryCalls.push({ args, method: "gte", table });
      return query;
    }),
    lte: vi.fn((...args: unknown[]) => {
      queryCalls.push({ args, method: "lte", table });
      return query;
    }),
    or: vi.fn((...args: unknown[]) => {
      queryCalls.push({ args, method: "or", table });
      return query;
    }),
    range: vi.fn((...args: unknown[]) => {
      queryCalls.push({ args, method: "range", table });
      return query;
    }),
    select: vi.fn((...args: unknown[]) => {
      queryCalls.push({ args, method: "select", table });
      return query;
    }),
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
}

function createRequest() {
  return new Request("http://localhost/api/cron/audit-missing-internationals", {
    headers: { Authorization: "Bearer test" },
    method: "POST",
  });
}

describe("/api/cron/audit-missing-internationals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:05:00.000Z"));
    vi.clearAllMocks();
    queryCalls.length = 0;
    rowsByTable = {
      matches: [
        {
          away_team_id: "team-rsa",
          home_team_id: "team-aus",
          kickoff_at: "2026-09-27T09:30:00.000Z",
        },
      ],
      teams: NATIONAL_TEAMS,
    };
    authMock.assertCronAuthorized.mockImplementation(() => undefined);
    fetchWikipediaMock.fetchWikipediaWikitext.mockResolvedValue(REAL_WIKITEXT);
    dbMock.from.mockImplementation((table: string) => createQuery(table));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when cron authorization fails", async () => {
    authMock.assertCronAuthorized.mockImplementation(() => {
      throw new authMock.CronUnauthorizedError();
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(fetchWikipediaMock.fetchWikipediaWikitext).not.toHaveBeenCalled();
    expect(dbMock.from).not.toHaveBeenCalled();
  });

  it("reports fixtures missing from the real page and loads DB rows in pages", async () => {
    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.window).toEqual({
      end: "2026-10-23",
      start: "2026-09-23",
    });
    expect(payload.data.pages).toEqual([
      "2026 men's rugby union internationals",
    ]);
    expect(payload.data.counts.missing).toBe(2);
    expect(payload.data.counts.present).toBe(1);
    expect(payload.data.counts.unresolved).toBeGreaterThanOrEqual(2);
    expect(
      payload.data.missing.map((fixture: { date: string }) => fixture.date),
    ).toEqual(["2026-10-10", "2026-10-17"]);
    expect(notifyMock.notifyMissingInternationals).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ homeCode: "NZL", awayCode: "AUS" }),
        expect.objectContaining({ homeCode: "AUS", awayCode: "NZL" }),
      ]),
      new Map([
        ["AUS", "オーストラリア"],
        ["NZL", "ニュージーランド"],
        ["RSA", "南アフリカ"],
      ]),
    );
    expect(queryCalls).toContainEqual({
      args: ["kind", "national"],
      method: "eq",
      table: "teams",
    });
    expect(queryCalls.filter(({ method }) => method === "range")).toEqual([
      { args: [0, 999], method: "range", table: "teams" },
      { args: [0, 999], method: "range", table: "matches" },
    ]);
    expect(queryCalls).toContainEqual(
      expect.objectContaining({ method: "gte", table: "matches" }),
    );
    expect(queryCalls).toContainEqual(
      expect.objectContaining({ method: "lte", table: "matches" }),
    );
    expect(queryCalls).toContainEqual(
      expect.objectContaining({ method: "or", table: "matches" }),
    );
  });

  it("does not notify when there are no missing fixtures", async () => {
    fetchWikipediaMock.fetchWikipediaWikitext.mockResolvedValue("");

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(notifyMock.notifyMissingInternationals).not.toHaveBeenCalled();
  });

  it("skips a missing next-year page when the window crosses into the next year", async () => {
    vi.setSystemTime(new Date("2026-12-15T00:05:00.000Z"));
    fetchWikipediaMock.fetchWikipediaWikitext
      .mockResolvedValueOnce("")
      .mockRejectedValueOnce(
        new FetchError({
          attempt: 1,
          status: 404,
          url: "https://en.wikipedia.org/wiki/2027_men%27s_rugby_union_internationals?action=raw",
        }),
      );

    const response = await POST(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchWikipediaMock.fetchWikipediaWikitext).toHaveBeenNthCalledWith(1, [
      "2026 men's rugby union internationals",
    ]);
    expect(fetchWikipediaMock.fetchWikipediaWikitext).toHaveBeenNthCalledWith(2, [
      "2027 men's rugby union internationals",
    ]);
    expect(payload.data.pages).toEqual([
      "2026 men's rugby union internationals",
    ]);
  });

  it("returns 500 and skips notification for a non-404 Wikipedia error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchWikipediaMock.fetchWikipediaWikitext.mockRejectedValueOnce(
      new FetchError({
        attempt: 1,
        status: 503,
        url: "https://en.wikipedia.org/raw",
      }),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(dbMock.from).not.toHaveBeenCalled();
    expect(notifyMock.notifyMissingInternationals).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
