import { describe, expect, it } from "vitest";

import { getTeamDisplayName } from "@/lib/format/team";

describe("getTeamDisplayName", () => {
  it("uses Japanese team names for Japanese surfaces", () => {
    expect(
      getTeamDisplayName({
        name: "Leinster",
        nameJa: "レンスター",
      }),
    ).toBe("レンスター");
  });

  it("keeps English team names for English surfaces", () => {
    expect(
      getTeamDisplayName(
        {
          name: "Leinster",
          nameJa: "レンスター",
        },
        "en",
      ),
    ).toBe("Leinster");
  });

  it("falls back to the canonical name when a Japanese name is unavailable", () => {
    expect(getTeamDisplayName({ name: "Unknown Team" })).toBe("Unknown Team");
  });
});
