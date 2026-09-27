import { describe, expect, it } from "vitest";

import {
  CLUB_COMPETITION_FAMILIES,
  isInternationalCompetitionFamily,
  prematchReminderDueAt,
} from "@/lib/x/post-reminders";

describe("isInternationalCompetitionFamily", () => {
  it.each([...CLUB_COMPETITION_FAMILIES, null])(
    "excludes club family %s",
    (family) => {
      expect(isInternationalCompetitionFamily(family)).toBe(false);
    },
  );

  it.each([
    "nations-championship",
    "bledisloe-cup",
    "australia-south-africa-test",
    "autumn-nations",
  ])("includes international family %s", (family) => {
    expect(isInternationalCompetitionFamily(family)).toBe(true);
  });
});

describe("prematchReminderDueAt", () => {
  it.each([
    ["2026-09-27T09:30:00.000Z", "2026-09-27T06:30:00.000Z"],
    ["2026-09-26T16:30:00.000Z", "2026-09-26T13:30:00.000Z"],
    ["2026-09-27T01:30:00.000Z", "2026-09-26T13:30:00.000Z"],
    ["2026-09-27T02:00:00.000Z", "2026-09-26T23:00:00.000Z"],
  ])("calculates a due time for kickoff %s", (kickoffAt, expected) => {
    expect(prematchReminderDueAt(new Date(kickoffAt)).toISOString()).toBe(
      expected,
    );
  });
});
