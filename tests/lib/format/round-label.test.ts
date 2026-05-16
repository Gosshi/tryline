import { describe, expect, it } from "vitest";

import { formatRoundLabel } from "@/lib/format/round-label";

describe("formatRoundLabel", () => {
  it("maps round zero to the playoff qualifier label", () => {
    expect(formatRoundLabel(0)).toBe("プレーオフ予選");
  });

  it("keeps regular rounds in Round N format", () => {
    expect(formatRoundLabel(3)).toBe("Round 3");
  });
});
