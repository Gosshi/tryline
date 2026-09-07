import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));

import { upsertMatches } from "@/lib/ingestion/upsert";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    awayScore: null,
    awayTeamId: "away-team",
    competitionId: "competition",
    externalIds: { top14_lnr_id: "lnr-11819" },
    homeScore: 27,
    homeTeamId: "home-team",
    kickoffAt: null,
    status: "finished" as const,
    venue: null,
    ...overrides,
  };
}

function existingMatch() {
  return {
    away_score: null,
    away_team_id: "away-team",
    competition_id: "competition",
    external_ids: { top14_lnr_id: "lnr-11819" },
    home_score: null,
    home_team_id: "home-team",
    id: "match-1",
    kickoff_at: "2026-09-05T17:05:00.000Z",
    status: "scheduled",
    venue: null,
  };
}

function createExistingMatchBuilder(existing: ReturnType<typeof existingMatch> | null) {
  return {
    contains: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    select: vi.fn().mockReturnThis(),
  };
}

function createUpdateBuilder(updates: unknown[]) {
  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { external_ids: { top14_lnr_id: "lnr-11819" }, id: "match-1" },
      error: null,
    }),
    update: vi.fn((update: unknown) => {
      updates.push(update);
      return createUpdateBuilder(updates);
    }),
  };
}

describe("upsertMatches kickoff preservation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("preserves an existing kickoff while applying a no-time Top 14 result", async () => {
    const updates: unknown[] = [];
    dbMock.from
      .mockReturnValueOnce(createExistingMatchBuilder(existingMatch()))
      .mockReturnValueOnce(createUpdateBuilder(updates));

    await upsertMatches([candidate()]);

    expect(updates).toEqual([
      expect.objectContaining({
        away_score: null,
        home_score: 27,
        kickoff_at: "2026-09-05T17:05:00.000Z",
        status: "finished",
      }),
    ]);
  });

  it("continues to update kickoff times supplied by other sources", async () => {
    const updates: unknown[] = [];
    dbMock.from
      .mockReturnValueOnce(createExistingMatchBuilder(existingMatch()))
      .mockReturnValueOnce(createUpdateBuilder(updates));

    await upsertMatches([
      candidate({
        externalIds: { wikipedia_event_id: "France_v_Wales" },
        kickoffAt: "2027-02-06T16:40:00.000Z",
      }),
    ]);

    expect(updates).toEqual([
      expect.objectContaining({ kickoff_at: "2027-02-06T16:40:00.000Z" }),
    ]);
  });

  it("skips and logs a no-time candidate without an existing match", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    dbMock.from.mockReturnValue(createExistingMatchBuilder(null));

    await expect(upsertMatches([candidate()])).resolves.toMatchObject({
      matchesInserted: 0,
      matchesUpdated: 0,
      records: [],
    });
    expect(warn).toHaveBeenCalledWith(
      "[ingestion] skipped match without kickoff_at",
      expect.objectContaining({
        externalIds: { top14_lnr_id: "lnr-11819" },
      }),
    );

    warn.mockRestore();
  });
});
