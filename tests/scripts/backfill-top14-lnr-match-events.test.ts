import { describe, expect, it, vi } from "vitest";

import {
  MAX_TOP14_LNR_MATCHES_PER_RUN,
  parseOptions,
  runTop14LnrMatchEventBackfill,
  TOP14_LNR_MATCH_DELAY_MS,
} from "@/scripts/backfill-top14-lnr-match-events";

import type { Json } from "@/lib/db/types";
import type { ParsedPlayerMatchEvent } from "@/lib/scrapers/wikipedia-match-events";
import type { SupabaseClient } from "@supabase/supabase-js";

const events: ParsedPlayerMatchEvent[] = [
  { isPenaltyTry: false, minute: 12, playerName: "A", teamSide: "home", type: "try" },
  { isPenaltyTry: false, minute: 12, playerName: "", teamSide: "home", type: "conversion" },
];

function createMockDb(rows: unknown[]) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: rows, error: null })),
  };

  return { db: { from: vi.fn(() => query) } as unknown as SupabaseClient, query };
}

function match(id: string) {
  return {
    away_score: 0,
    away_team: { name: "Away" },
    away_team_id: "away-team",
    external_ids: { top14_lnr_match_path: `/feuille-de-match/${id}` } as Json,
    home_score: 7,
    home_team: { name: "Home" },
    home_team_id: "home-team",
    id,
  };
}

describe("backfill-top14-lnr-match-events", () => {
  it("parses the bounded limit and dry-run options", () => {
    expect(parseOptions(["--limit=3", "--dry-run"])).toEqual({ dryRun: true, limit: 3 });
    expect(parseOptions([])).toEqual({ dryRun: false, limit: MAX_TOP14_LNR_MATCHES_PER_RUN });
    expect(() => parseOptions(["--limit=8"])).toThrow(/between 1 and 7/);
  });

  it("dry-runs target matches without writing and waits between them", async () => {
    const { db, query } = createMockDb([match("match-1"), match("match-2")]);
    const fetchEvents = vi.fn().mockResolvedValue(events);
    const upsertEvents = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const logger = { log: vi.fn(), warn: vi.fn() };

    await expect(
      runTop14LnrMatchEventBackfill(
        { dryRun: true, limit: 7 },
        db,
        { fetchEvents, logger, sleep, upsertEvents },
      ),
    ).resolves.toEqual({ eventsInserted: 0, targetMatches: 2 });

    expect(query.limit).toHaveBeenCalledWith(MAX_TOP14_LNR_MATCHES_PER_RUN);
    expect(upsertEvents).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(TOP14_LNR_MATCH_DELAY_MS);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Target finished Top 14 matches without events: 2"),
    );
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("[dry-run] match-1"));
  });

  it("stops and reports an insertion rejection", async () => {
    const { db } = createMockDb([match("match-1")]);
    const logger = { log: vi.fn(), warn: vi.fn() };
    const upsertEvents = vi.fn().mockResolvedValue({
      inserted: 0,
      rejected: [{ detail: "expected=7-0; actual=0-0", reason: "score_mismatch" }],
      warnings: [],
    });

    await expect(
      runTop14LnrMatchEventBackfill(
        { dryRun: false, limit: 1 },
        db,
        { fetchEvents: async () => events, logger, upsertEvents },
      ),
    ).rejects.toThrow(/score_mismatch/);
    expect(logger.warn).toHaveBeenCalledWith(
      "Top 14 event insertion rejected",
      expect.objectContaining({ matchId: "match-1" }),
    );
  });
});
