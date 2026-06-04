import { describe, expect, it } from "vitest";

import { deriveMatchPhase } from "@/lib/llm/stages/assemble";

describe("deriveMatchPhase", () => {
  it("derives third-place playoff phase before final fallback", () => {
    expect(
      deriveMatchPhase({ round_name: "3rd place match", source: "live" }),
    ).toBe("playoff_third_place");
    expect(
      deriveMatchPhase({ round_name: "3rd place match/Final", source: "live" }),
    ).toBe("playoff_third_place");
    expect(
      deriveMatchPhase({ round_name: "Bronze Final", source: "wikipedia" }),
    ).toBe("playoff_third_place");
  });

  it("keeps existing final, semifinal, and league phase derivation", () => {
    expect(deriveMatchPhase({ round_name: "Final", source: "live" })).toBe(
      "playoff_final",
    );
    expect(deriveMatchPhase({ round_name: "Semi-final", source: "live" })).toBe(
      "playoff_semifinal",
    );
    expect(deriveMatchPhase({ source: "live", wikipedia_round: 2 })).toBe(
      "league",
    );
  });
});
