import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getSupabaseServerClient: vi.fn() }));
const eventMocks = vi.hoisted(() => ({ upsertMatchEvents: vi.fn() }));
const wikiMocks = vi.hoisted(() => ({ fetchWikipediaWikitext: vi.fn() }));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: dbMocks.getSupabaseServerClient,
}));
vi.mock("@/lib/ingestion/events", () => eventMocks);
vi.mock(
  "@/lib/ingestion/sources/wikipedia-wikitext",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/ingestion/sources/wikipedia-wikitext")
      >();
    return {
      ...actual,
      fetchWikipediaWikitext: wikiMocks.fetchWikipediaWikitext,
    };
  },
);

import { pointsForMatchEvent } from "@/lib/format/match-event-points";
import { applyManualInternationalResults } from "@/lib/ingestion/manual-international-results";

import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

const WIKITEXT = readFileSync(
  "tests/fixtures/wikipedia-2026-mens-rugby-union-internationals.wiki",
  "utf8",
);
// HTML was captured via fetchWithPolicy from the same Wikipedia page on 2026-09-25.
// Its real Japan–Canada event block for 2026-09-05 provides the successful case.
const HTML = readFileSync(
  "tests/fixtures/wikipedia-2026-mens-rugby-union-internationals.html",
  "utf8",
);
const PAGE_TITLE = "2026 men's rugby union internationals";
const PAGE_URL =
  "https://en.wikipedia.org/wiki/2026_men%27s_rugby_union_internationals";

type Team = {
  english_name: string | null;
  name: string;
  short_code: string | null;
};
type MatchRow = {
  away_score: number | null;
  away_team: Team | null;
  away_team_id: string;
  external_ids: Record<string, unknown>;
  home_score: number | null;
  home_team: Team | null;
  home_team_id: string;
  id: string;
  kickoff_at: string;
};

function match(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    away_score: null,
    away_team: { english_name: "Canada", name: "カナダ", short_code: "CAN" },
    away_team_id: "canada-id",
    external_ids: { source: "manual", keep: "existing" },
    home_score: null,
    home_team: { english_name: "Japan", name: "日本", short_code: "JPN" },
    home_team_id: "japan-id",
    id: "japan-canada",
    kickoff_at: "2026-09-05T15:30:00.000Z",
    ...overrides,
  };
}

function setClient(rows: MatchRow[], existingEventIds = new Set<string>()) {
  const update = vi.fn((values: Record<string, unknown>) => ({
    eq: vi.fn(async (_column: string, id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) Object.assign(row, values);
      return { error: null };
    }),
  }));
  const matchQuery: Record<string, unknown> = {};
  const filters: Array<{ column: string; operator: string; value: unknown }> =
    [];
  const addFilter = (operator: string) => (column: string, value: unknown) => {
    filters.push({ column, operator, value });
    return matchQuery;
  };
  const filterFns: Record<string, (...args: never[]) => unknown> = {
    eq: vi.fn(addFilter("eq")),
    gte: vi.fn(addFilter("gte")),
    is: vi.fn(addFilter("is")),
    lte: vi.fn(async (column: string, value: unknown) => {
      filters.push({ column, operator: "lte", value });
      const filtered = rows.filter((row) =>
        filters.every((filter) => {
          const actual =
            filter.column === "external_ids->>source"
              ? row.external_ids.source
              : row[filter.column as keyof MatchRow];
          if (filter.operator === "eq" || filter.operator === "is") {
            return actual === filter.value;
          }
          const actualTime = Date.parse(String(actual));
          const filterTime = Date.parse(String(filter.value));
          return filter.operator === "gte"
            ? actualTime >= filterTime
            : actualTime <= filterTime;
        }),
      );
      return { data: filtered, error: null };
    }),
    select: vi.fn(() => matchQuery),
  };
  Object.assign(matchQuery, filterFns, { update });

  const eventsQuery = {
    eq: vi.fn(async (_column: string, id: string) => ({
      count: existingEventIds.has(id) ? 1 : 0,
      error: null,
    })),
    select: vi.fn(() => eventsQuery),
  };
  dbMocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "matches") return matchQuery;
      if (table === "match_events") return eventsQuery;
      throw new Error(`Unexpected table: ${table}`);
    }),
  });
  return { update };
}

describe("applyManualInternationalResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wikiMocks.fetchWikipediaWikitext.mockResolvedValue(WIKITEXT);
    eventMocks.upsertMatchEvents.mockResolvedValue({
      inserted: 18,
      rejected: [],
      warnings: [],
    });
  });

  it("updates the score and only sends the uniquely selected real event block", async () => {
    const row = match();
    const { update } = setClient([row]);
    const fetchHtml = vi.fn(async () => HTML);

    await expect(
      applyManualInternationalResults({
        fetchHtml,
        now: new Date("2026-09-06T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      candidates: 1,
      eventRetryCandidates: 0,
      eventsInserted: 18,
      scoresUpdated: 1,
      skipped: [],
    });

    expect(update).toHaveBeenCalledWith({
      away_score: 12,
      external_ids: {
        keep: "existing",
        result_source: "wikipedia-internationals",
        source: "manual",
        wikipedia_url: PAGE_URL,
      },
      home_score: 57,
      status: "finished",
    });
    expect(wikiMocks.fetchWikipediaWikitext).toHaveBeenCalledWith([PAGE_TITLE]);
    expect(fetchHtml).toHaveBeenCalledWith(PAGE_URL);
    expect(eventMocks.upsertMatchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        awayTeamId: "canada-id",
        events: expect.arrayContaining([
          expect.objectContaining({ teamSide: "home" }),
        ]),
        homeTeamId: "japan-id",
        matchId: "japan-canada",
      }),
    );
    const [submitted] = eventMocks.upsertMatchEvents.mock.calls[0] as [
      { events: ParsedMatchEvent[] },
    ];
    expect(submitted.events).toHaveLength(18);
    expect(
      submitted.events.reduce(
        (totals, event) => {
          totals[event.teamSide] += pointsForMatchEvent(event);
          return totals;
        },
        { away: 0, home: 0 },
      ),
    ).toEqual({ away: 12, home: 57 });
  });

  it.each([
    {
      row: match({
        away_team: { english_name: "Chile", name: "Chile", short_code: "CHI" },
        away_team_id: "chile-id",
        home_team: {
          english_name: "France",
          name: "France",
          short_code: "FRA",
        },
        home_team_id: "france-id",
        id: "no-result",
        kickoff_at: "2026-09-26T12:00:00.000Z",
      }),
      reason: "no_rugbybox",
    },
    {
      row: match({
        away_team: {
          english_name: "South Africa",
          name: "South Africa",
          short_code: "RSA",
        },
        away_team_id: "rsa-id",
        home_team: {
          english_name: "Australia",
          name: "Australia",
          short_code: "AUS",
        },
        home_team_id: "aus-id",
        id: "future-match",
        kickoff_at: "2026-09-27T09:30:00.000Z",
      }),
      reason: "score_not_published",
    },
  ])(
    "skips a matching result without a published score ($reason)",
    async ({ row, reason }) => {
      setClient([row]);
      const result = await applyManualInternationalResults({
        now: new Date("2026-09-28T00:00:00.000Z"),
      });
      expect(result.skipped).toEqual([{ matchId: row.id, reason }]);
      expect(result.scoresUpdated).toBe(0);
      expect(eventMocks.upsertMatchEvents).not.toHaveBeenCalled();
    },
  );

  it("retries events for a recent Wikipedia-scored match without changing its score", async () => {
    const row = match({
      away_score: 12,
      external_ids: {
        result_source: "wikipedia-internationals",
        source: "manual",
        wikipedia_url: PAGE_URL,
      },
      home_score: 57,
    });
    const { update } = setClient([row]);
    const fetchHtml = vi.fn(async () => HTML);

    await expect(
      applyManualInternationalResults({
        fetchHtml,
        now: new Date("2026-09-06T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      candidates: 0,
      eventRetryCandidates: 1,
      eventsInserted: 18,
      scoresUpdated: 0,
      skipped: [],
    });

    expect(update).not.toHaveBeenCalled();
    expect(wikiMocks.fetchWikipediaWikitext).not.toHaveBeenCalled();
    expect(fetchHtml).toHaveBeenCalledWith(PAGE_URL);
    expect(eventMocks.upsertMatchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: row.id }),
    );
  });

  it("reports an event retry candidate when its page has no unique event block", async () => {
    const row = match({
      away_score: 12,
      away_team: {
        english_name: "Unmatched visitor",
        name: "Canada",
        short_code: "CAN",
      },
      external_ids: {
        result_source: "wikipedia-internationals",
        source: "manual",
      },
      home_score: 57,
      home_team: {
        english_name: "Unmatched host",
        name: "Japan",
        short_code: "JPN",
      },
    });
    const { update } = setClient([row]);

    const result = await applyManualInternationalResults({
      fetchHtml: async () => HTML,
      now: new Date("2026-09-06T00:00:00.000Z"),
    });

    expect(result.eventRetryCandidates).toBe(1);
    expect(result.skipped).toContainEqual({
      matchId: row.id,
      reason: "no_unique_event_block",
    });
    expect(update).not.toHaveBeenCalled();
    expect(eventMocks.upsertMatchEvents).not.toHaveBeenCalled();
  });

  it.each([
    { id: "manual-score", external_ids: { source: "manual" }, ageDays: 1, hasEvents: false },
    {
      id: "existing-events",
      external_ids: {
        result_source: "wikipedia-internationals",
        source: "manual",
      },
      ageDays: 1,
      hasEvents: true,
    },
    {
      id: "too-old-event-retry",
      external_ids: {
        result_source: "wikipedia-internationals",
        source: "manual",
      },
      ageDays: 8,
      hasEvents: false,
    },
  ])("does not retry events for ineligible scored matches ($id)", async (testCase) => {
    const row = match({
      away_score: 12,
      external_ids: testCase.external_ids,
      home_score: 57,
      id: testCase.id,
      kickoff_at: new Date(
        Date.UTC(2026, 8, 6 - testCase.ageDays, 15, 30),
      ).toISOString(),
    });
    setClient([row], testCase.hasEvents ? new Set([row.id]) : new Set());

    const result = await applyManualInternationalResults({
      now: new Date("2026-09-06T00:00:00.000Z"),
    });

    expect(result.eventRetryCandidates).toBe(0);
    expect(wikiMocks.fetchWikipediaWikitext).not.toHaveBeenCalled();
  });

  it("does not send the whole page to event insertion when no unique block is found", async () => {
    const row = match({
      away_team: {
        english_name: "Unmatched visitor",
        name: "Canada",
        short_code: "CAN",
      },
      home_team: {
        english_name: "Unmatched host",
        name: "Japan",
        short_code: "JPN",
      },
    });
    setClient([row]);
    const fetchHtml = vi.fn(async () => HTML);

    const result = await applyManualInternationalResults({
      fetchHtml,
      now: new Date("2026-09-06T00:00:00.000Z"),
    });

    expect(result.skipped).toContainEqual({
      matchId: row.id,
      reason: "no_unique_event_block",
    });
    expect(eventMocks.upsertMatchEvents).not.toHaveBeenCalled();
  });

  it("skips when more than one result box matches the same teams and date", async () => {
    const row = match();
    setClient([row]);
    const duplicateBox =
      "{{rugbybox\n|date = 5 September 2026\n|team1 = {{ru-rt|JPN}}\n|score = 57–12\n|team2 = {{ru|CAN}}\n}}";

    const result = await applyManualInternationalResults({
      fetchWikitext: async () => `${duplicateBox}\n${duplicateBox}`,
      now: new Date("2026-09-06T00:00:00.000Z"),
    });

    expect(result.skipped).toEqual([
      { matchId: row.id, reason: "ambiguous_rugbybox" },
    ]);
  });

  it("does not call event insertion for a match that already has events", async () => {
    const row = match();
    setClient([row], new Set([row.id]));
    const fetchHtml = vi.fn();

    const result = await applyManualInternationalResults({
      fetchHtml,
      now: new Date("2026-09-06T00:00:00.000Z"),
    });

    expect(result.scoresUpdated).toBe(1);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(eventMocks.upsertMatchEvents).not.toHaveBeenCalled();
  });

  it("reports rejected event totals and does not count events as inserted", async () => {
    setClient([match()]);
    eventMocks.upsertMatchEvents.mockResolvedValue({
      inserted: 0,
      rejected: [{ detail: "score mismatch", reason: "score_mismatch" }],
      warnings: [],
    });

    const result = await applyManualInternationalResults({
      fetchHtml: async () => HTML,
      now: new Date("2026-09-06T00:00:00.000Z"),
    });

    expect(result.eventsInserted).toBe(0);
    expect(result.skipped).toContainEqual({
      matchId: "japan-canada",
      reason: "event_total_mismatch",
    });
  });

  it.each([
    {
      away: "AUS",
      home: "RSA",
      date: "2026-09-27T09:30:00.000Z",
      id: "reversed",
    },
    {
      away: "CAN",
      home: "JPN",
      date: "2026-08-28T23:59:59.999Z",
      id: "too-old",
    },
    {
      away: "CAN",
      home: "JPN",
      date: "2026-09-06T02:00:00.001Z",
      id: "too-new",
    },
    {
      away: "CAN",
      home: "JPN",
      date: "2026-09-05T15:30:00.000Z",
      awayScore: 12,
      homeScore: 57,
      id: "already-scored",
    },
  ])(
    "does not update reversed, out-of-window, or already-scored matches ($id)",
    async ({ away, home, date, id }) => {
      const row = match({
        away_score: id === "already-scored" ? 12 : null,
        away_team: { english_name: away, name: away, short_code: away },
        home_score: id === "already-scored" ? 57 : null,
        home_team: { english_name: home, name: home, short_code: home },
        id,
        kickoff_at: date,
      });
      const { update } = setClient([row]);

      const result = await applyManualInternationalResults({
        now: new Date(
          id === "reversed"
            ? "2026-09-28T00:00:00.000Z"
            : "2026-09-06T00:00:00.000Z",
        ),
      });

      expect(update).not.toHaveBeenCalled();
      if (id === "reversed") {
        expect(result.skipped).toContainEqual({
          matchId: id,
          reason: "home_away_reversed",
        });
      } else {
        expect(result.candidates).toBe(0);
      }
    },
  );

  it("skips fixtures that are not marked manual", async () => {
    setClient([match({ external_ids: { source: "wikipedia" } })]);
    const result = await applyManualInternationalResults({
      now: new Date("2026-09-06T00:00:00.000Z"),
    });
    expect(result.candidates).toBe(0);
    expect(wikiMocks.fetchWikipediaWikitext).not.toHaveBeenCalled();
  });
});
