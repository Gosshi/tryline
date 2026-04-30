import { describe, expect, it } from "vitest";

import { getTeamFlag } from "@/lib/format/team-identity";

describe("team identity formatter", () => {
  it("returns subdivision flags instead of a bare black flag", () => {
    expect(getTeamFlag("england")).not.toBe("🏴");
    expect(getTeamFlag("scotland")).not.toBe("🏴");
    expect(getTeamFlag("wales")).not.toBe("🏴");
  });

  it("returns the rugby fallback for unknown teams", () => {
    expect(getTeamFlag("unknown")).toBe("🏉");
  });
});
