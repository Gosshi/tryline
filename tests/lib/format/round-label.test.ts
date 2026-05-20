import { describe, expect, it } from "vitest";

import { formatRoundLabel } from "@/lib/format/round-label";

describe("formatRoundLabel", () => {
  it("maps round zero to the playoff qualifier label", () => {
    expect(formatRoundLabel(0)).toBe("プレーオフ予選");
  });

  it("keeps regular rounds in Round N format", () => {
    expect(formatRoundLabel(3)).toBe("第3節");
  });

  it("maps RWC knockout rounds to stage labels", () => {
    expect(formatRoundLabel(5, "rwc")).toBe("準々決勝");
    expect(formatRoundLabel(6, "rwc")).toBe("準決勝");
    expect(formatRoundLabel(7, "rwc")).toBe("3位決定戦");
    expect(formatRoundLabel(8, "rwc")).toBe("決勝");
  });

  it("keeps non-RWC knockout round numbers unchanged", () => {
    expect(formatRoundLabel(8, "six-nations")).toBe("第8節");
  });

  it("maps Wikipedia large playoff round numbers to stage labels", () => {
    expect(formatRoundLabel(100, "urc")).toBe("準々決勝");
    expect(formatRoundLabel(101, "premiership")).toBe("準決勝");
    expect(formatRoundLabel(102)).toBe("決勝");
    expect(formatRoundLabel(103)).toBe("3位決定戦");
  });
});
