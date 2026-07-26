import { describe, expect, it } from "vitest";

import { parseArgs } from "@/scripts/fetch-weekly-news";

describe("fetch-weekly-news CLI", () => {
  it("accepts an optional weekly start date", () => {
    expect(parseArgs(["--week-from", "2026-07-13"])).toEqual({
      weekFrom: "2026-07-13",
    });
  });

  it("rejects malformed weekly start dates", () => {
    expect(() => parseArgs(["--week-from=13-07-2026"])).toThrow("Usage:");
  });
});
