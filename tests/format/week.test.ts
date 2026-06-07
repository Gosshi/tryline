import { describe, expect, it } from "vitest";

import { getCurrentJstWeekRangeUtc } from "@/lib/format/week";

describe("getCurrentJstWeekRangeUtc", () => {
  it("returns Monday 00:00 JST through next Monday 00:00 JST", () => {
    const range = getCurrentJstWeekRangeUtc(
      new Date("2026-06-07T14:59:59.000Z"),
    );

    expect(range).toEqual({
      endUtcIso: "2026-06-07T15:00:00.000Z",
      startUtcIso: "2026-05-31T15:00:00.000Z",
    });
  });

  it("moves to the next week at Monday 00:00 JST", () => {
    const range = getCurrentJstWeekRangeUtc(
      new Date("2026-06-07T15:00:00.000Z"),
    );

    expect(range).toEqual({
      endUtcIso: "2026-06-14T15:00:00.000Z",
      startUtcIso: "2026-06-07T15:00:00.000Z",
    });
  });
});
