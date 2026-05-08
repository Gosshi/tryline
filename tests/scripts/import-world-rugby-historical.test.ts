import { describe, expect, it, vi } from "vitest";

import {
  buildSeasonTasks,
  parseArgs,
  runWorldRugbyHistoricalImport,
} from "@/scripts/import-world-rugby-historical";

describe("import-world-rugby-historical", () => {
  it("parses default and filtered arguments", () => {
    expect(parseArgs(["--dry-run"])).toEqual({
      dryRun: true,
      families: ["pnc", "autumn-nations"],
      fromYear: 2020,
      toYear: 2025,
    });
    expect(
      parseArgs(["--family=autumn-nations", "--from", "2022", "--to=2023"]),
    ).toEqual({
      dryRun: false,
      families: ["autumn-nations"],
      fromYear: 2022,
      toYear: 2023,
    });
  });

  it("builds tasks with competition IDs and skipped seasons", () => {
    expect(
      buildSeasonTasks({
        families: ["pnc"],
        fromYear: 2020,
        toYear: 2025,
      }),
    ).toEqual([
      { competitionId: null, family: "pnc", season: "2020" },
      { competitionId: null, family: "pnc", season: "2021" },
      { competitionId: "2104", family: "pnc", season: "2022" },
      { competitionId: null, family: "pnc", season: "2023" },
      {
        competitionId: "735a21a5-9069-4fad-810e-81806f9c47a4",
        family: "pnc",
        season: "2024",
      },
      {
        competitionId: "0c6a4bb9-4cf9-4960-a587-0022dd2985a4",
        family: "pnc",
        season: "2025",
      },
    ]);
  });

  it("includes 2025 World Rugby competition IDs for default imports", () => {
    expect(
      buildSeasonTasks({
        families: ["autumn-nations", "pnc"],
        fromYear: 2025,
        toYear: 2025,
      }),
    ).toEqual([
      {
        competitionId: "03cdc8d6-d13d-4e47-962e-3c0663306cb3",
        family: "autumn-nations",
        season: "2025",
      },
      {
        competitionId: "0c6a4bb9-4cf9-4960-a587-0022dd2985a4",
        family: "pnc",
        season: "2025",
      },
    ]);
  });

  it("dry-runs targets and skips missing competition IDs", async () => {
    const importSeason = vi.fn();
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runWorldRugbyHistoricalImport({
      dryRun: true,
      families: ["pnc"],
      fromYear: 2021,
      importSeason,
      logger,
      sleepMs: 0,
      toYear: 2022,
    });

    expect(importSeason).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "[skip] pnc/2021: no competition ID",
    );
    expect(logger.log).toHaveBeenCalledWith("[target] pnc/2022: 2104");
    expect(result).toMatchObject({
      failedSeasons: 0,
      skippedSeasons: 1,
      successfulSeasons: 0,
    });
  });

  it("imports seasons sequentially and continues after season errors", async () => {
    const importSeason = vi
      .fn()
      .mockResolvedValueOnce({
        eventsInserted: 10,
        failedMatches: 0,
        lineupsInserted: 46,
        matchesImported: 2,
        teamsImported: 4,
      })
      .mockRejectedValueOnce(new Error("schedule failed"));
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runWorldRugbyHistoricalImport({
      dryRun: false,
      families: ["autumn-nations"],
      fromYear: 2021,
      importSeason,
      logger,
      sleepMs: 0,
      toYear: 2022,
    });

    expect(importSeason).toHaveBeenNthCalledWith(1, {
      competitionId: "2050",
      family: "autumn-nations",
      season: "2021",
    });
    expect(importSeason).toHaveBeenNthCalledWith(2, {
      competitionId: "2091",
      family: "autumn-nations",
      season: "2022",
    });
    expect(result).toMatchObject({
      failedSeasons: 1,
      skippedSeasons: 0,
      successfulSeasons: 1,
    });
  });
});
