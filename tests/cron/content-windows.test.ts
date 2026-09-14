import { describe, expect, it } from "vitest";

import {
  previewCandidateUpperBound,
  recapCandidateUpperBound,
} from "@/lib/cron/content-windows";
import { previewDueUpperBound } from "@/lib/cron/preview-window";

describe("content generation candidate windows", () => {
  it.each([
    ["2026-09-18T06:00:00.000Z", "2026-09-19T06:00:00.000Z"],
    ["2026-09-18T18:00:00.000Z", "2026-09-19T15:00:00.000Z"],
  ])("bounds preview candidates at %s", (now, expected) => {
    expect(previewCandidateUpperBound(new Date(now))).toBe(expected);
  });

  it("does not change the shared preview due bound", () => {
    expect(previewDueUpperBound(new Date("2026-09-18T06:00:00.000Z"))).toBe("2026-09-19T15:00:00.000Z");
  });

  it.each([
    ["2026-09-19T06:00:00.000Z", "2026-09-18T09:30:00.000Z"],
    ["2026-09-19T12:00:00.000Z", "2026-09-19T00:00:00.000Z"],
    ["2026-09-20T06:00:00.000Z", "2026-09-19T09:30:00.000Z"],
  ])("bounds recap candidates at %s", (now, expected) => {
    expect(recapCandidateUpperBound(new Date(now))).toBe(expected);
  });
});
