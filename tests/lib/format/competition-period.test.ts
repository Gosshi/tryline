import { describe, expect, it } from "vitest";

import { getKnownCompetitionPeriod } from "@/lib/format/competition-period";

describe("getKnownCompetitionPeriod", () => {
  it("returns the known RWC 2027 dates", () => {
    expect(getKnownCompetitionPeriod("rwc-2027")).toEqual({
      endDate: "2027-11-13",
      startDate: "2027-10-01",
    });
  });

  it("returns the host-announced Nations Championship 2026 dates", () => {
    expect(getKnownCompetitionPeriod("nations-championship-2026")).toEqual({
      endDate: "2026-11-29",
      startDate: "2026-07-04",
    });
  });

  it("returns null for unknown seasons", () => {
    expect(getKnownCompetitionPeriod("rwc-2031")).toBeNull();
  });
});
