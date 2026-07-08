import { describe, expect, it } from "vitest";

import { getResultTeamNameFontSize } from "@/lib/seo/og-result-team-name";

describe("getResultTeamNameFontSize", () => {
  it("keeps short names at the existing result OG size", () => {
    expect(getResultTeamNameFontSize("日本")).toBe(58);
    expect(getResultTeamNameFontSize("NZ")).toBe(58);
  });

  it("shrinks medium-length Japanese team names", () => {
    expect(getResultTeamNameFontSize("イングランド")).toBe(46);
    expect(getResultTeamNameFontSize("オーストラリア")).toBe(46);
  });

  it("fits long national team names on one result OG line", () => {
    expect(getResultTeamNameFontSize("ニュージーランド")).toBe(38);
    expect(getResultTeamNameFontSize("アルゼンチン")).toBe(46);
  });

  it("uses a lower floor for longer club names", () => {
    expect(getResultTeamNameFontSize("グラスゴー・ウォリアーズ")).toBe(30);
    expect(getResultTeamNameFontSize("ニューカッスル・ファルコンズ")).toBe(26);
  });
});
