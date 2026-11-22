import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => db }));
import {
  planMatchUpserts,
  upsertMatches,
  upsertPlannedMatches,
} from "@/lib/ingestion/upsert";

import type { ResolvedMatchCandidate } from "@/lib/ingestion/upsert";
const existing = {
  id: "finished-match",
  competition_id: "nc",
  home_team_id: "england",
  away_team_id: "nz",
  kickoff_at: "2026-11-21T14:10:00Z",
  kickoff_time_tbd: false,
  home_score: 37,
  away_score: 12,
  status: "finished",
  venue: "London",
  external_ids: { wikipedia_event_id: "round_6_england_v_new_zealand" },
};
const candidate: ResolvedMatchCandidate = {
  competitionId: "nc",
  homeTeamId: "england",
  awayTeamId: "nz",
  kickoffAt: "2026-11-28T16:40:00Z",
  kickoffTimeTbd: false,
  homeScore: null,
  awayScore: null,
  status: "scheduled",
  venue: "Twickenham",
  externalIds: existing.external_ids,
};
beforeEach(() => {
  vi.clearAllMocks();
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { ...existing }, error: null }),
    update: db.update,
    insert: db.insert,
    single: vi
      .fn()
      .mockResolvedValue({
        data: { id: existing.id, external_ids: existing.external_ids },
        error: null,
      }),
  };
  db.from.mockReturnValue(builder);
  db.update.mockReturnValue(builder);
  db.insert.mockReturnValue(builder);
});
afterEach(() => vi.restoreAllMocks());
describe("finished kickoff guard", () => {
  it("blocks the week-long move in writes and plans without inserting a replacement", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await upsertMatches([candidate])).toMatchObject({
      matchesInserted: 0,
      matchesUpdated: 0,
      matchesSkippedUnsafe: 1,
      records: [],
    });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({
        id: existing.id,
        homeTeamId: "england",
        awayTeamId: "nz",
        previousKickoffAt: existing.kickoff_at,
        kickoffAt: candidate.kickoffAt,
      }),
    );
    const plan = await planMatchUpserts([candidate]);
    expect(plan[0]?.operation).toBe("blocked");
    expect(await upsertPlannedMatches(plan)).toMatchObject({
      matchesSkippedUnsafe: 1,
      records: [],
    });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it.each(["2026-11-19T14:10:00Z", "2026-11-23T14:10:00Z"])(
    "allows corrections exactly 48 hours away (%s)",
    async (kickoffAt) => {
      expect(
        (await planMatchUpserts([{ ...candidate, kickoffAt }]))[0]?.operation,
      ).toBe("update");
      expect(await upsertMatches([{ ...candidate, kickoffAt }])).toMatchObject({
        matchesUpdated: 1,
        matchesSkippedUnsafe: 0,
      });
      expect(db.update).toHaveBeenCalledWith(
        expect.objectContaining({ kickoff_at: kickoffAt }),
      );
    },
  );
  it.each(["2026-11-19T14:09:59.999Z", "2026-11-23T14:10:00.001Z"])(
    "blocks corrections just beyond 48 hours (%s)",
    async (kickoffAt) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(
        (await planMatchUpserts([{ ...candidate, kickoffAt }]))[0]?.operation,
      ).toBe("blocked");
      expect(await upsertMatches([{ ...candidate, kickoffAt }])).toMatchObject({
        matchesSkippedUnsafe: 1,
      });
      expect(db.update).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    },
  );
  it("allows long rescheduling of a scheduled match", async () => {
    db.from().maybeSingle.mockResolvedValue({
      data: { ...existing, status: "scheduled" },
      error: null,
    });
    expect((await planMatchUpserts([candidate]))[0]?.operation).toBe("update");
    expect(await upsertMatches([candidate])).toMatchObject({
      matchesUpdated: 1,
      matchesSkippedUnsafe: 0,
    });
  });
  it("preserves kickoff when the candidate has no date", async () => {
    expect(
      await upsertMatches([{ ...candidate, kickoffAt: null }]),
    ).toMatchObject({ matchesUpdated: 1, matchesSkippedUnsafe: 0 });
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({ kickoff_at: existing.kickoff_at }),
    );
  });
});
