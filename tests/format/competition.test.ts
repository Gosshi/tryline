import { describe, expect, it } from "vitest";

import { formatFamilyName } from "@/lib/format/competition";

describe("formatFamilyName", () => {
  it("formats PNC family aliases as Nations Cup", () => {
    expect(formatFamilyName("pnc")).toBe("Nations Cup");
    expect(formatFamilyName("pacific-nations-cup")).toBe("Nations Cup");
  });
});
