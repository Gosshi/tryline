import { describe, expect, it } from "vitest";

import { parseOptions } from "@/scripts/backfill-rwc-match-events";

describe("backfill-rwc-match-events", () => {
  it("parses season, force, dry-run, and limit options", () => {
    expect(
      parseOptions(["--season=2023", "--force", "--dry-run", "--limit=48"]),
    ).toEqual({
      dryRun: true,
      force: true,
      limit: 48,
      season: "2023",
    });
  });
});
