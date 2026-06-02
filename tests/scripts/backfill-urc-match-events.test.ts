import { describe, expect, it } from "vitest";

import { parseOptions } from "@/scripts/backfill-urc-match-events";

describe("backfill-urc-match-events", () => {
  it("parses dry-run and season options", () => {
    expect(parseOptions(["--season=2025-26", "--dry-run"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      season: "2025-26",
    });
  });

  it("parses owner approval confirmation", () => {
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      dryRun: false,
      ownerApproved: true,
      season: null,
    });
  });

  it("rejects invalid seasons", () => {
    expect(() => parseOptions(["--season=2025"])).toThrow(
      "Invalid --season value: 2025",
    );
  });
});
