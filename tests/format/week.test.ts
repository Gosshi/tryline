import { describe, expect, it } from "vitest";

import {
  formatJstWeekRangeLabel,
  getCurrentJstWeekRangeUtc,
  getJstWeekRangeUtc,
  resolveJstWeekStartDate,
} from "@/lib/format/week";

describe("JST week formatting", () => {
  const now = new Date("2026-07-08T03:00:00.000Z");

  it("builds the current JST monday range", () => {
    expect(getCurrentJstWeekRangeUtc(now)).toMatchObject({
      endUtcIso: "2026-07-12T15:00:00.000Z",
      startUtcIso: "2026-07-05T15:00:00.000Z",
      weekStartJst: "2026-07-06",
    });
  });

  it("accepts monday week queries within eight weeks", () => {
    expect(getJstWeekRangeUtc("2026-07-13", now)).toMatchObject({
      endUtcIso: "2026-07-19T15:00:00.000Z",
      startUtcIso: "2026-07-12T15:00:00.000Z",
      weekStartJst: "2026-07-13",
    });
  });

  it("falls back for non-monday and out-of-window values", () => {
    expect(resolveJstWeekStartDate("2026-07-14", now)).toBe("2026-07-06");
    expect(resolveJstWeekStartDate("2026-09-07", now)).toBe("2026-07-06");
    expect(resolveJstWeekStartDate("not-a-date", now)).toBe("2026-07-06");
  });

  it("formats ranges across month boundaries", () => {
    expect(formatJstWeekRangeLabel("2026-06-29")).toBe(
      "6月29日 - 7月5日 JST",
    );
  });
});
