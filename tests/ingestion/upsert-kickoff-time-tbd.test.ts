import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => db }));

import { parsePremiershipLiveWikitext } from "@/lib/ingestion/sources/wikipedia-premiership";
import {
  upsertMatches,
  type ResolvedMatchCandidate,
} from "@/lib/ingestion/upsert";

function parsed(time: string) {
  return parsePremiershipLiveWikitext(`=== Round 1 ===
{{rugbybox|date=24 April 2027|time=${time}|home=Bath|away=Bristol Bears|score=}}`)[0]!;
}
function candidate(time: string): ResolvedMatchCandidate {
  const match = parsed(time);
  return {
    awayScore: null,
    awayTeamId: "bristol",
    competitionId: "premiership",
    externalIds: { ...match.externalIds, wikipedia_event_id: match.eventId },
    homeScore: null,
    homeTeamId: "bath",
    kickoffAt: match.kickoffAt,
    kickoffTimeTbd: match.kickoffTimeTbd,
    status: "scheduled",
    venue: null,
  };
}

describe("kickoff TBD persistence", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([false, true])(
    "inserts kickoff_time_tbd=%s",
    async (kickoffTimeTbd) => {
      const lookup = {
        contains: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      const write = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "match-1", external_ids: {} },
          error: null,
        }),
      };
      const insert = vi.fn().mockReturnValue(write);
      db.from.mockReturnValue({ ...lookup, insert });
      await expect(
        upsertMatches([{ ...candidate(""), kickoffTimeTbd }]),
      ).resolves.toMatchObject({ matchesInserted: 1, matchesUpdated: 0 });
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ kickoff_time_tbd: kickoffTimeTbd }),
      );
    },
  );

  it.each(["date-only", "legacy timestamp"])(
    "updates the original row when time is announced (%s ID)",
    async (idKind) => {
      const pending = parsed("");
      const eventId =
        idKind === "date-only"
          ? pending.eventId
          : `bath_bristol-bears_${pending.kickoffAt}`;
      const existing = {
        id: "match-1",
        competition_id: "premiership",
        home_team_id: "bath",
        away_team_id: "bristol",
        kickoff_at: pending.kickoffAt,
        kickoff_time_tbd: true,
        external_ids: { wikipedia_event_id: eventId },
        status: "scheduled",
        home_score: null,
        away_score: null,
        venue: null,
      };
      const lookup = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        contains: vi
          .fn()
          .mockImplementation(
            (_: string, ids: { wikipedia_event_id: string }) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: ids.wikipedia_event_id === eventId ? existing : null,
                error: null,
              }),
            }),
          ),
      };
      const write = {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "match-1", external_ids: {} },
          error: null,
        }),
      };
      const update = vi.fn().mockReturnValue(write);
      const insert = vi.fn();
      db.from.mockReturnValue({ ...lookup, update, insert });
      await expect(upsertMatches([candidate("15:00")])).resolves.toMatchObject({
        matchesInserted: 0,
        matchesUpdated: 1,
        records: [expect.objectContaining({ id: "match-1" })],
      });
      expect(write.eq).toHaveBeenCalledWith("id", "match-1");
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          kickoff_time_tbd: false,
          kickoff_at: "2027-04-24T14:00:00.000Z",
        }),
      );
      expect(insert).not.toHaveBeenCalled();
    },
  );
});
