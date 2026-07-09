import { describe, expect, it, vi } from "vitest";

import {
  parseOptions,
  runBackfillTop14RegularSeason,
} from "@/scripts/backfill-top14-regular-season";

import type { Top14LnrMatchResult } from "@/lib/scrapers/top14-lnr-results";

const MATCHES: Top14LnrMatchResult[] = [
  {
    away_score: 18,
    away_team_slug: "clermont",
    home_score: 31,
    home_team_slug: "toulouse",
    kickoff_at: "2025-09-06T19:05:00.000Z",
    lnr_id: "11001",
    lnr_match_path:
      "/feuille-de-match/2025-2026/j1/11001-stade-toulousain-asm-clermont-auvergne",
    round: 1,
    round_slug: "j1",
    season: "2025-26",
    source_url: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
    status: "finished",
    venue: "Stade Ernest-Wallon",
  },
];

describe("backfill-top14-regular-season", () => {
  it("parses dry-run and write approval options", () => {
    expect(parseOptions(["--season=2025-26", "--dry-run"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      season: "2025-26",
    });
    expect(
      parseOptions(["--season", "2025-26", "--confirm-owner-approved"]),
    ).toEqual({
      dryRun: false,
      ownerApproved: true,
      season: "2025-26",
    });
    expect(() => parseOptions(["--season=2025-26"])).toThrow("Writes require");
  });

  it("dry-runs parsed targets without touching Supabase", async () => {
    const db = {
      from: vi.fn(() => {
        throw new Error("db should not be touched during dry-run");
      }),
    };
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };

    await expect(
      runBackfillTop14RegularSeason({
        db: db as never,
        fetchResults: vi.fn().mockResolvedValue(MATCHES),
        logger,
        options: {
          dryRun: true,
          ownerApproved: false,
          season: "2025-26",
        },
      }),
    ).resolves.toEqual({
      dryRun: true,
      matchesInserted: 0,
      matchesUpdated: 0,
      parsed: 1,
      season: "2025-26",
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "Top 14 regular-season target: season=2025-26 parsed=1 teams=2 dry_run=true",
    );
  });
});
