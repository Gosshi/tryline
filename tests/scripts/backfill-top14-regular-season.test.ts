import { describe, expect, it, vi } from "vitest";

import {
  mergeCompetitionDateRange,
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
  {
    away_score: null,
    away_team_slug: "stade-francais",
    home_score: null,
    home_team_slug: "bordeaux-begles",
    kickoff_at: "2025-09-07T14:30:00.000Z",
    lnr_id: "11002",
    lnr_match_path:
      "/feuille-de-match/2025-2026/j1/11002-union-bordeaux-begles-stade-francais-paris",
    round: 1,
    round_slug: "j1",
    season: "2025-26",
    source_url: "https://top14.lnr.fr/calendrier-et-resultats/2025-2026/j1",
    status: "scheduled",
    venue: null,
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
    expect(parseOptions(["--season=2026-27", "--dry-run"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      season: "2026-27",
    });
    expect(parseOptions(["--season=2024-25", "--dry-run"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      season: "2024-25",
    });
    expect(() => parseOptions(["--season=1999-00", "--dry-run"])).toThrow(
      "Unsupported Top 14 regular-season --season=1999-00",
    );
    expect(() => parseOptions(["--season=abc", "--dry-run"])).toThrow(
      "Usage:",
    );
  });

  it("merges regular-season dates with existing competition dates", () => {
    expect(
      mergeCompetitionDateRange(
        { endDate: "2026-06-27", startDate: "2026-06-13" },
        { endDate: "2026-06-06", startDate: "2025-09-06" },
      ),
    ).toEqual({
      endDate: "2026-06-27",
      startDate: "2025-09-06",
    });
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
      finished: 1,
      matchesInserted: 0,
      matchesUpdated: 0,
      parsed: 2,
      scheduled: 1,
      season: "2025-26",
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "Top 14 regular-season target: season=2025-26 parsed=2 teams=4 dry_run=true",
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Top 14 regular-season status: finished=1 scheduled=1",
    );
    expect(logger.log).toHaveBeenCalledWith(
      "Top 14 regular-season sample 1: toulouse vs clermont kickoff=2025-09-06T19:05:00.000Z venue=Stade Ernest-Wallon score=31-18",
    );
  });
});
