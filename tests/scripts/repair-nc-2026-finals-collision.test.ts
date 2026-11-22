import { describe, expect, it } from "vitest";

import { planMatchUpserts } from "@/lib/ingestion/upsert";
import { historicalUpdateViolations } from "@/scripts/repair-nc-2026-finals-collision";

import type {
  ExistingMatch,
  ResolvedMatchCandidate,
} from "@/lib/ingestion/upsert";

const italy: ExistingMatch = {
  id: "e249c5a0-d438-4f61-87f2-18a1c4421e53",
  competition_id: "nc",
  home_team_id: "italy",
  away_team_id: "fiji",
  kickoff_at: "2026-11-21T16:40:00+00:00",
  kickoff_time_tbd: false,
  external_ids: { wikipedia_round: 6, wikipedia_event_id: "mwBEU" },
  status: "finished",
  home_score: 16,
  away_score: 21,
  venue: "Italy",
};

const candidate: ResolvedMatchCandidate = {
  competitionId: "nc",
  homeTeamId: "italy",
  awayTeamId: "fiji",
  kickoffAt: "2026-11-21T16:40:00.000Z",
  kickoffTimeTbd: false,
  externalIds: {
    wikipedia_round: 6,
    wikipedia_event_id: "round_6_italy_v_fiji",
  },
  status: "finished",
  homeScore: 16,
  awayScore: 21,
  venue: "Italy",
};

describe("NC repair dry-run checks", () => {
  it("allows the same kickoff instant and the specified Italy event ID migration", async () => {
    const plan = await planMatchUpserts([candidate], {
      existingMatches: [italy],
    });
    expect(plan[0]).toMatchObject({
      operation: "update",
      existing: { id: italy.id },
    });
    expect(historicalUpdateViolations(plan)).toEqual({
      kickoffChanges: [],
      otherChanges: [],
    });
  });

  it("reports a real kickoff change and rejects extra changes alongside the event ID", async () => {
    const plan = await planMatchUpserts(
      [
        {
          ...candidate,
          kickoffAt: "2026-11-21T17:40:00Z",
          externalIds: {
            wikipedia_round: 7,
            wikipedia_event_id: "round_6_italy_v_fiji",
            wikipedia_legacy_event_ids: ["mwBEU"],
          },
          venue: "New venue",
        },
      ],
      { existingMatches: [italy] },
    );
    expect(historicalUpdateViolations(plan)).toEqual({
      kickoffChanges: plan,
      otherChanges: plan,
    });
  });
});
