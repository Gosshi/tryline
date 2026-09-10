import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ getSupabaseServerClient: vi.fn() }));

vi.mock("@/lib/db/server", () => dbMocks);
vi.mock("@/lib/llm/notify", () => ({
  notifyEventIngestionIdentityAlert: vi.fn(),
}));

import {
  resetEventInsertionValidationSnapshotForTest,
  upsertMatchEvents,
} from "@/lib/ingestion/events";

afterEach(() => {
  resetEventInsertionValidationSnapshotForTest();
  vi.clearAllMocks();
});

it("reuses paged fixture and signature reads across upsert calls", async () => {
  const fixtureRange = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const eventRange = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const canonicalMatch = {
    away_score: null,
    away_team_id: "away",
    external_ids: {},
    home_score: null,
    home_team_id: "home",
    id: "match-1",
    status: "scheduled",
  };
  const matches = {
    eq: vi.fn(() => matches),
    range: fixtureRange,
    select: vi.fn((columns: string) =>
      columns === "id, external_ids" ? { range: fixtureRange } : matches,
    ),
    single: vi.fn(() => Promise.resolve({ data: canonicalMatch, error: null })),
  };
  const eventValidationQuery = { range: eventRange };
  const matchEvents = {
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
    select: vi.fn(() => eventValidationQuery),
  };

  dbMocks.getSupabaseServerClient.mockReturnValue({
    from: vi.fn((table: string) =>
      table === "matches" ? matches : matchEvents,
    ),
  });

  const params = {
    awayTeamId: "away",
    events: [],
    homeTeamId: "home",
    matchId: "match-1",
  };

  await upsertMatchEvents(params);
  await upsertMatchEvents(params);

  expect(fixtureRange).toHaveBeenCalledTimes(1);
  expect(fixtureRange).toHaveBeenCalledWith(0, 499);
  expect(eventRange).toHaveBeenCalledTimes(1);
  expect(eventRange).toHaveBeenCalledWith(0, 499);
});

it("retries a recovered database after the first snapshot load rejects", async () => {
  const failure = new Error("synthetic transient database failure");
  const fixtureRange = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: failure })
    .mockResolvedValue({ data: [], error: null });
  const existingEventRange = vi
    .fn()
    .mockResolvedValue({ data: [], error: null });
  const canonicalMatch = {
    away_score: null,
    away_team_id: "away",
    external_ids: {},
    home_score: null,
    home_team_id: "home",
    id: "match",
    status: "scheduled",
  };
  const lookup = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: canonicalMatch, error: null }),
  };
  const deletion = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ error: null }),
  }));
  dbMocks.getSupabaseServerClient.mockReturnValue({
    from: (table: string) =>
      table === "matches"
        ? {
            select: (columns: string) =>
              columns === "id, external_ids" ? { range: fixtureRange } : lookup,
          }
        : { delete: deletion, select: () => ({ range: existingEventRange }) },
  });
  const params = {
    awayTeamId: "away",
    events: [],
    homeTeamId: "home",
    matchId: "match",
  };

  await expect(upsertMatchEvents(params)).rejects.toBe(failure);
  await expect(upsertMatchEvents(params)).resolves.toMatchObject({
    inserted: 0,
    rejected: [],
  });

  expect(fixtureRange).toHaveBeenCalledTimes(2);
  expect(existingEventRange).toHaveBeenCalledTimes(2);
  expect(lookup.single).toHaveBeenCalledTimes(2);
  expect(deletion).toHaveBeenCalledTimes(1);
});
