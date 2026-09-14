import { expect, it } from "vitest";

import { previewDueUpperBound } from "@/lib/cron/preview-window";

it("includes midnight of the day after tomorrow 24 hours before its intended release", () => {
  const now = new Date("2026-09-11T06:00:00.000Z"); // Sep 11, 15:00 JST
  const kickoff = new Date("2026-09-12T15:00:00.000Z"); // Sep 13, 00:00 JST
  const intendedRelease = new Date("2026-09-12T06:00:00.000Z"); // Sep 12, 15:00 JST
  expect(now.getTime()).toBeLessThan(intendedRelease.getTime());
  expect(kickoff.getTime()).toBeLessThanOrEqual(new Date(previewDueUpperBound(now)).getTime());
});
