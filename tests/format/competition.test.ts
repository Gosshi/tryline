import { describe, expect, it } from "vitest";

import {
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";

describe("formatFamilyName", () => {
  it("formats PNC family aliases as Nations Cup", () => {
    expect(formatFamilyName("pnc")).toBe("Nations Cup");
    expect(formatFamilyName("pacific-nations-cup")).toBe("Nations Cup");
  });

  it("returns competition family colors with a fallback", () => {
    expect(getCompetitionFamilyColor("six-nations")).toBe("#001489");
    expect(getCompetitionFamilyColor("premiership")).toBe("#1C2C6B");
    expect(getCompetitionFamilyColor("urc")).toBe("#00823E");
    expect(getCompetitionFamilyColor("top-14")).toBe("#D62B31");
    expect(getCompetitionFamilyColor("super-rugby-pacific")).toBe("#0057B8");
    expect(getCompetitionFamilyColor("rugby-championship")).toBe("#C8102E");
    expect(getCompetitionFamilyColor("unknown-family")).toBe("#1e293b");
  });
});
