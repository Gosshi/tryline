import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { previewDueUpperBound } from "@/lib/cron/preview-window";

describe("previewDueUpperBound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["2026-09-12T15:00:00.000Z", "2026-09-11T06:00:00.000Z"],
    ["2026-09-11T15:00:00.000Z", "2026-09-11T05:00:00.000Z"],
    ["2026-09-12T15:00:00.000Z", "2026-09-11T12:00:00.000Z"],
    ["2026-09-12T15:00:00.000Z", "2026-09-11T18:00:00.000Z"],
  ])("returns %s when now is %s", (expected, now) => {
    vi.setSystemTime(new Date(now));

    expect(previewDueUpperBound(new Date())).toBe(expected);
  });

  it("returns the exclusive start of the following JST day", () => {
    vi.setSystemTime(new Date("2026-09-11T06:00:00.000Z"));

    expect(previewDueUpperBound(new Date())).toBe(
      "2026-09-12T15:00:00.000Z",
    );
  });

  it.each([
    ["2026-09-11T06:00:00.000Z", "2026-09-12T15:00:00.000Z"],
    ["2026-09-11T05:59:59.999Z", "2026-09-11T15:00:00.000Z"],
    ["2026-09-11T06:00:00.001Z", "2026-09-12T15:00:00.000Z"],
  ])("uses the expected upper bound at JST 15:00 boundary (%s)", (now, expected) => {
    vi.setSystemTime(new Date(now));

    expect(previewDueUpperBound(new Date())).toBe(expected);
  });
});
