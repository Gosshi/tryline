import { describe, expect, it } from "vitest";

import { previewDueUpperBound } from "@/lib/cron/preview-window";

describe("previewDueUpperBound", () => {
  it.each([
    ["2026-09-12T15:00:00.000Z", "2026-09-11T06:00:00.000Z"],
    ["2026-09-11T15:00:00.000Z", "2026-09-11T05:00:00.000Z"],
    ["2026-09-12T15:00:00.000Z", "2026-09-11T12:00:00.000Z"],
    ["2026-09-12T15:00:00.000Z", "2026-09-11T18:00:00.000Z"],
  ])("returns %s when now is %s", (expected, now) => {
    expect(previewDueUpperBound(new Date(now))).toBe(expected);
  });
});
