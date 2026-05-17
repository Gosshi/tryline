import { describe, expect, it } from "vitest";

import {
  formatCompetitionTitle,
  formatFamilyName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";

describe("formatFamilyName", () => {
  it("formats PNC family aliases as Nations Cup", () => {
    expect(formatFamilyName("pnc")).toBe("Nations Cup");
    expect(formatFamilyName("pacific-nations-cup")).toBe("Nations Cup");
  });

  it("formats League One family name in Japanese", () => {
    expect(formatFamilyName("league-one")).toBe(
      "ジャパンラグビー リーグワン",
    );
  });

  it("formats League One competition titles in Japanese without changing slugs", () => {
    expect(formatCompetitionTitle("League One", "2025-26")).toBe(
      "ジャパンラグビー リーグワン 2025-26",
    );
    expect(formatCompetitionTitle("Japan Rugby League One 2024-25", "2024-25"))
      .toBe("ジャパンラグビー リーグワン 2024-25");
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
