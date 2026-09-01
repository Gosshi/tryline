import { describe, expect, it } from "vitest";

import {
  findIncompleteCompetitionSchedulesForWeek,
  hasIncompleteCompetitionSchedule,
} from "@/lib/format/schedule-coverage";

describe("schedule coverage", () => {
  const incompleteTop14 = {
    endDate: "2027-06-26",
    family: "top-14",
    latestKickoffAt: "2026-09-13T20:05:00.000Z",
    name: "Top 14",
    nameJa: null,
    season: "2026-27",
    slug: "top-14-2026-27",
  };

  it("identifies a schedule whose known fixtures end before its competition end date", () => {
    expect(hasIncompleteCompetitionSchedule(incompleteTop14)).toBe(true);
    expect(
      hasIncompleteCompetitionSchedule({
        ...incompleteTop14,
        latestKickoffAt: "2027-05-15T19:00:00.000Z",
        endDate: "2027-05-15",
      }),
    ).toBe(false);
  });

  it("only shows the notice for weeks after the latest ingested fixture", () => {
    expect(
      findIncompleteCompetitionSchedulesForWeek(
        [incompleteTop14],
        "2026-09-06T15:00:00.000Z",
      ),
    ).toEqual([]);
    expect(
      findIncompleteCompetitionSchedulesForWeek(
        [incompleteTop14],
        "2026-10-25T15:00:00.000Z",
      ),
    ).toEqual([incompleteTop14]);
  });
});
