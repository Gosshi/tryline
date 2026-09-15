import { afterEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

import {
  listMatchIdsWithContent,
  listPrerenderMatchIds,
  listPrerenderRoundHubParams,
  listRoundHubParams,
  PRERENDER_MATCH_WINDOW_DAYS,
  PRERENDER_ROUND_WINDOW_DAYS,
} from "@/lib/db/queries/matches";

function createQuery({
  filteredRows,
  rows,
}: {
  filteredRows: unknown[];
  rows: unknown[];
}) {
  const query = {
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };

  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.order.mockImplementation(() =>
    Promise.resolve({
      data: query.gte.mock.calls.length > 0 ? filteredRows : rows,
      error: null,
    }),
  );

  return query;
}

describe("prerender queries", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("limits published match-content params to the 90-day window without changing sitemap params", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00.000Z"));
    const rows = [
      {
        generated_at: "2026-09-15T00:00:00.000Z",
        match_id: "recent-match",
        match: {
          competition: { family: "six-nations", slug: "six-nations-2026" },
          kickoff_at: "2026-09-06T00:00:00.000Z",
        },
      },
      {
        generated_at: "2026-09-14T00:00:00.000Z",
        match_id: "future-match",
        match: {
          competition: { family: "six-nations", slug: "six-nations-2027" },
          kickoff_at: "2027-02-01T00:00:00.000Z",
        },
      },
      {
        generated_at: "2026-06-09T00:00:00.000Z",
        match_id: "old-match",
        match: {
          competition: { family: null, slug: "legacy-cup-2026" },
          kickoff_at: "2026-06-08T00:00:00.000Z",
        },
      },
      {
        generated_at: "2026-09-01T00:00:00.000Z",
        match_id: "recent-match",
        match: {
          competition: { family: "six-nations", slug: "six-nations-2026" },
          kickoff_at: "2026-09-06T00:00:00.000Z",
        },
      },
    ];
    const sitemapQuery = createQuery({ filteredRows: rows, rows });
    const prerenderQuery = createQuery({
      filteredRows: [rows[0], rows[1], rows[3]],
      rows,
    });
    clientMock.from
      .mockReturnValueOnce(sitemapQuery)
      .mockReturnValueOnce(prerenderQuery);

    await expect(listMatchIdsWithContent()).resolves.toEqual([
      {
        competitionFamily: "six-nations",
        id: "recent-match",
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
      {
        competitionFamily: "six-nations",
        id: "future-match",
        updatedAt: "2026-09-14T00:00:00.000Z",
      },
      {
        competitionFamily: "legacy-cup",
        id: "old-match",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
    ]);

    await expect(listPrerenderMatchIds()).resolves.toEqual([
      {
        competitionFamily: "six-nations",
        id: "recent-match",
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
      {
        competitionFamily: "six-nations",
        id: "future-match",
        updatedAt: "2026-09-14T00:00:00.000Z",
      },
    ]);

    expect(prerenderQuery.gte).toHaveBeenCalledWith(
      "match.kickoff_at",
      "2026-06-18T00:00:00.000Z",
    );
    expect(prerenderQuery.select).toHaveBeenCalledWith(
      expect.stringContaining("kickoff_at"),
    );
    expect(PRERENDER_MATCH_WINDOW_DAYS).toBe(90);
  });

  it("limits round hubs to rounds with a latest kickoff in the 120-day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T00:00:00.000Z"));
    const rows = [
      {
        competition: { family: "six-nations", season: "2025" },
        external_ids: { round: 1 },
        kickoff_at: "2026-02-28T00:00:00.000Z",
      },
      {
        competition: { family: "six-nations", season: "2026" },
        external_ids: { round: 2 },
        kickoff_at: "2026-08-17T00:00:00.000Z",
      },
    ];
    const sitemapQuery = createQuery({ filteredRows: rows, rows });
    const prerenderQuery = createQuery({
      filteredRows: rows.slice(1),
      rows,
    });
    clientMock.from
      .mockReturnValueOnce(sitemapQuery)
      .mockReturnValueOnce(prerenderQuery);

    await expect(listRoundHubParams()).resolves.toHaveLength(2);
    await expect(listPrerenderRoundHubParams()).resolves.toEqual([
      {
        competition: "six-nations",
        round: 2,
        season: "2026",
        updatedAt: "2026-08-17T00:00:00.000Z",
      },
    ]);

    expect(prerenderQuery.gte).toHaveBeenCalledWith(
      "kickoff_at",
      "2026-05-19T00:00:00.000Z",
    );
    expect(PRERENDER_ROUND_WINDOW_DAYS).toBe(120);
  });
});
