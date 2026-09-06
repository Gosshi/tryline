import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
}));
const scraperMocks = vi.hoisted(() => ({
  fetchJrfuScheduleResults: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: dbMocks.getSupabaseServerClient,
}));
vi.mock("@/lib/scrapers/jrfu-schedule-results", () => scraperMocks);

import { applyJrfuResultFallback } from "@/lib/ingestion/jrfu-result-fallback";

type MatchRow = {
  away_score: number | null;
  away_team: { slug: string } | null;
  home_score: number | null;
  home_team: { slug: string } | null;
  id: string;
  kickoff_at: string;
  status: string;
};

function createClient(rows: MatchRow[]) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  }));
  const matchesQuery = {
    or: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    select: vi.fn(() => matchesQuery),
  };
  const teamsQuery = {
    eq: vi.fn(() => teamsQuery),
    select: vi.fn(() => teamsQuery),
    single: vi.fn(() => Promise.resolve({ data: { id: "japan-id" }, error: null })),
  };

  dbMocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "teams") {
        return teamsQuery;
      }

      if (table === "matches") {
        return { ...matchesQuery, update };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  });

  return { update };
}

describe("JRFU result fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches an overseas fixture whose JRFU date is one day after its UTC kickoff date", async () => {
    const { update } = createClient([
      {
        away_score: null,
        away_team: { slug: "canada" },
        home_score: null,
        home_team: { slug: "japan" },
        id: "japan-canada",
        kickoff_at: "2026-09-05T15:30:00.000Z",
        status: "scheduled",
      },
    ]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-06",
        japanScore: 57,
        opponentName: "カナダ代表",
        opponentScore: 12,
      },
    ]);

    await expect(applyJrfuResultFallback()).resolves.toEqual({
      counts: {
        existing_results_skipped: 0,
        matches_updated: 1,
        unknown_opponents_skipped: 0,
      },
      source: "jrfu-schedule",
    });
    expect(update).toHaveBeenCalledWith({
      away_score: 12,
      home_score: 57,
      status: "finished",
    });
  });

  it.each([
    { away_score: null, home_score: null, status: "finished" },
    { away_score: null, home_score: 24, status: "scheduled" },
    { away_score: 17, home_score: null, status: "scheduled" },
  ])("does not overwrite an existing result state", async (existing) => {
    const { update } = createClient([
      {
        away_team: { slug: "canada" },
        home_team: { slug: "japan" },
        id: "protected-match",
        kickoff_at: "2026-09-05T05:50:00.000Z",
        ...existing,
      },
    ]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-05",
        japanScore: 57,
        opponentName: "カナダ代表",
        opponentScore: 12,
      },
    ]);

    await expect(applyJrfuResultFallback()).resolves.toMatchObject({
      counts: { existing_results_skipped: 1, matches_updated: 0 },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("skips an unknown opponent and logs its JRFU spelling", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { update } = createClient([]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-05",
        japanScore: 57,
        opponentName: "未知代表",
        opponentScore: 12,
      },
    ]);

    await expect(applyJrfuResultFallback()).resolves.toMatchObject({
      counts: { unknown_opponents_skipped: 1 },
    });
    expect(warn).toHaveBeenCalledWith(
      "[jrfu-result-fallback] skipped unknown opponent",
      { opponentName: "未知代表" },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("does not update a JRFU fixture with a partial score", async () => {
    const { update } = createClient([]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-05",
        japanScore: 57,
        opponentName: "カナダ代表",
        opponentScore: null,
      },
    ]);

    await expect(applyJrfuResultFallback()).resolves.toMatchObject({
      counts: { matches_updated: 0 },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("selects the only fixture in the two-day window for a repeat opponent", async () => {
    const { update } = createClient([
      {
        away_score: null,
        away_team: { slug: "australia" },
        home_score: null,
        home_team: { slug: "japan" },
        id: "japan-australia-august-8",
        kickoff_at: "2026-08-08T05:15:00.000Z",
        status: "scheduled",
      },
      {
        away_score: null,
        away_team: { slug: "australia" },
        home_score: null,
        home_team: { slug: "japan" },
        id: "japan-australia-august-15",
        kickoff_at: "2026-08-15T05:15:00.000Z",
        status: "scheduled",
      },
    ]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-08-08",
        japanScore: 21,
        opponentName: "オーストラリア代表",
        opponentScore: 18,
      },
    ]);

    await applyJrfuResultFallback();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.results[0]?.value.eq).toHaveBeenCalledWith(
      "id",
      "japan-australia-august-8",
    );
  });

  it("logs and skips an ambiguous date window", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { update } = createClient([
      {
        away_score: null,
        away_team: { slug: "canada" },
        home_score: null,
        home_team: { slug: "japan" },
        id: "canada-one",
        kickoff_at: "2026-09-04T05:00:00.000Z",
        status: "scheduled",
      },
      {
        away_score: null,
        away_team: { slug: "canada" },
        home_score: null,
        home_team: { slug: "japan" },
        id: "canada-two",
        kickoff_at: "2026-09-06T05:00:00.000Z",
        status: "scheduled",
      },
    ]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-05",
        japanScore: 57,
        opponentName: "カナダ代表",
        opponentScore: 12,
      },
    ]);

    await applyJrfuResultFallback();

    expect(warn).toHaveBeenCalledWith(
      "[jrfu-result-fallback] skipped unmatched result",
      {
        candidateMatchIds: ["canada-one", "canada-two"],
        dateJrfu: "2026-09-05",
        opponentName: "カナダ代表",
      },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("logs and skips when no match falls within the date window", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { update } = createClient([
      {
        away_score: null,
        away_team: { slug: "canada" },
        home_score: null,
        home_team: { slug: "japan" },
        id: "canada-outside-window",
        kickoff_at: "2026-09-09T05:00:00.000Z",
        status: "scheduled",
      },
    ]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-05",
        japanScore: 57,
        opponentName: "カナダ代表",
        opponentScore: 12,
      },
    ]);

    await applyJrfuResultFallback();

    expect(warn).toHaveBeenCalledWith(
      "[jrfu-result-fallback] skipped unmatched result",
      {
        candidateMatchIds: [],
        dateJrfu: "2026-09-05",
        opponentName: "カナダ代表",
      },
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("logs a score conflict without overwriting an existing result", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { update } = createClient([
      {
        away_score: 18,
        away_team: { slug: "canada" },
        home_score: 21,
        home_team: { slug: "japan" },
        id: "existing-result",
        kickoff_at: "2026-09-05T05:00:00.000Z",
        status: "finished",
      },
    ]);
    scraperMocks.fetchJrfuScheduleResults.mockResolvedValue([
      {
        dateJrfu: "2026-09-05",
        japanScore: 57,
        opponentName: "カナダ代表",
        opponentScore: 12,
      },
    ]);

    await applyJrfuResultFallback();

    expect(warn).toHaveBeenCalledWith(
      "[jrfu-result-fallback] existing score conflict; skipped",
      {
        jrfuScore: { away_score: 12, home_score: 57 },
        matchId: "existing-result",
        storedScore: { away_score: 18, home_score: 21 },
      },
    );
    expect(update).not.toHaveBeenCalled();
  });
});
