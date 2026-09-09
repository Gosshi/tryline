import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: mocks.db }));
vi.mock("@/lib/llm/notify", () => ({ notifyEventIngestionIdentityAlert: vi.fn() }));

import { resetEventInsertionValidationSnapshotForTest, upsertMatchEvents } from "@/lib/ingestion/events";

beforeEach(() => resetEventInsertionValidationSnapshotForTest());

it("retries a recovered database after the first snapshot load rejects", async () => {
  const failure = new Error("synthetic transient database failure");
  const fixtureRange = vi.fn()
    .mockResolvedValueOnce({ data: null, error: failure })
    .mockResolvedValue({ data: [], error: null });
  const existingEventRange = vi.fn().mockResolvedValue({ data: [], error: null });
  const canonical = {
    id: "match", status: "scheduled", home_team_id: "home", away_team_id: "away",
    home_score: null, away_score: null, external_ids: {},
  };
  const lookup = { eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: canonical, error: null }) };
  const deletion = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  mocks.db.mockReturnValue({ from: (table: string) => table === "matches"
    ? { select: (columns: string) => columns === "id, external_ids" ? { range: fixtureRange } : lookup }
    : { select: () => ({ range: existingEventRange }), delete: deletion },
  });
  const params = { matchId: "match", homeTeamId: "home", awayTeamId: "away", events: [] };
  await expect(upsertMatchEvents(params)).rejects.toBe(failure);
  expect(deletion).not.toHaveBeenCalled();

  await expect(upsertMatchEvents(params)).resolves.toMatchObject({ inserted: 0, rejected: [] });

  expect(fixtureRange).toHaveBeenCalledTimes(2);
  expect(existingEventRange).toHaveBeenCalledTimes(2);
  expect(lookup.single).toHaveBeenCalledTimes(2);
  expect(deletion).toHaveBeenCalledTimes(1);
});
