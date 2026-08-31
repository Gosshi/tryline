import { describe, expect, it } from "vitest";

import {
  formatCompetitionTitle,
  formatFamilyName,
  formatPoolName,
  getCompetitionDisplayName,
  getCompetitionFamilyColor,
} from "@/lib/format/competition";

describe("formatFamilyName", () => {
  it("formats PNC family aliases in Japanese", () => {
    expect(formatFamilyName("pnc")).toBe("パシフィック・ネーションズカップ");
    expect(formatFamilyName("pacific-nations-cup")).toBe(
      "パシフィック・ネーションズカップ",
    );
  });

  it("formats formal competition family names in Japanese", () => {
    expect(formatFamilyName("nations-championship")).toBe(
      "ネーションズチャンピオンシップ",
    );
    expect(formatFamilyName("rugby-championship")).toBe(
      "ザ・ラグビーチャンピオンシップ",
    );
    expect(formatFamilyName("rwc")).toBe("ラグビーワールドカップ");
  });

  it("formats other Japanese competition family names", () => {
    expect(formatFamilyName("premiership")).toBe("プレミアシップ");
    expect(formatFamilyName("top-14")).toBe("トップ14");
    expect(formatFamilyName("urc")).toBe(
      "ユナイテッド・ラグビー・チャンピオンシップ",
    );
  });

  it("formats League One family name in Japanese", () => {
    expect(formatFamilyName("league-one")).toBe("ジャパンラグビー リーグワン");
  });

  it("formats the Lipovitan Challenge Cup family name in Japanese", () => {
    expect(formatFamilyName("lipovitan-challenge-cup")).toBe(
      "リポビタンDチャレンジカップ",
    );
  });

  it("formats the Puma Trophy family name in Japanese", () => {
    expect(formatFamilyName("puma-trophy")).toBe("プーマ・トロフィー");
  });

  it("falls back to title case for unknown family names", () => {
    expect(formatFamilyName("unknown-cup")).toBe("Unknown Cup");
  });

  it("formats known pool names and preserves unknown names", () => {
    expect(formatPoolName("Northern Hemisphere")).toBe("北半球");
    expect(formatPoolName("Southern Hemisphere")).toBe("南半球");
    expect(formatPoolName("Pool A")).toBe("プールA");
    expect(formatPoolName("Pool G")).toBe("プールG");
    expect(formatPoolName("Conference X")).toBe("Conference X");
  });

  it("formats League One competition titles in Japanese without changing slugs", () => {
    expect(formatCompetitionTitle("League One", "2025-26")).toBe(
      "ジャパンラグビー リーグワン 2025-26",
    );
    expect(
      formatCompetitionTitle("Japan Rugby League One 2024-25", "2024-25"),
    ).toBe("ジャパンラグビー リーグワン 2024-25");
  });

  it("uses Japanese competition display names when available", () => {
    const competition = {
      name: "Six Nations",
      nameJa: "シックスネイションズ",
    };

    expect(getCompetitionDisplayName(competition)).toBe("シックスネイションズ");
    expect(getCompetitionDisplayName(competition, "en")).toBe("Six Nations");
    expect(formatCompetitionTitle(competition, "2025")).toBe(
      "シックスネイションズ 2025",
    );
  });

  it("returns competition family colors with a fallback", () => {
    expect(getCompetitionFamilyColor("six-nations")).toBe("#001489");
    expect(getCompetitionFamilyColor("premiership")).toBe("#1C2C6B");
    expect(getCompetitionFamilyColor("urc")).toBe("#00823E");
    expect(getCompetitionFamilyColor("top-14")).toBe("#D62B31");
    expect(getCompetitionFamilyColor("super-rugby-pacific")).toBe("#0057B8");
    expect(getCompetitionFamilyColor("rugby-championship")).toBe("#C8102E");
    expect(getCompetitionFamilyColor("nations-championship")).toBe("#1A3A5C");
    expect(getCompetitionFamilyColor("greatest-rivalry")).toBe("#007A4D");
    expect(getCompetitionFamilyColor("lipovitan-challenge-cup")).toBe(
      "#E60012",
    );
    expect(getCompetitionFamilyColor("puma-trophy")).toBe("#75AADB");
    expect(getCompetitionFamilyColor("unknown-family")).toBe("#1e293b");
  });
});
