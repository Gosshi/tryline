import { describe, expect, it } from "vitest";

import {
  calculateCostUsd,
  normalizeModelForPricing,
  OPENAI_PRICING_USD_PER_1M_TOKENS,
} from "@/lib/llm/pricing";

describe("OpenAI pricing", () => {
  it("defines the GPT-5.6 model prices", () => {
    expect(OPENAI_PRICING_USD_PER_1M_TOKENS["gpt-5.6-sol"]).toEqual({
      input: 5,
      output: 30,
    });
    expect(OPENAI_PRICING_USD_PER_1M_TOKENS["gpt-5.6-terra"]).toEqual({
      input: 2,
      output: 12,
    });
    expect(OPENAI_PRICING_USD_PER_1M_TOKENS["gpt-5.6-luna"]).toEqual({
      input: 0.2,
      output: 1.2,
    });
  });

  it("calculates the price for a GPT-5.6 Terra response", () => {
    expect(
      calculateCostUsd({
        inputTokens: 1_000_000,
        modelVersion: "gpt-5.6-terra-2026-08-07",
        outputTokens: 1_000_000,
      }),
    ).toBe(14);
  });

  it("rejects an unknown model instead of using a different price", () => {
    expect(() => normalizeModelForPricing("unknown-model")).toThrow(
      "Unsupported model for pricing: unknown-model",
    );
  });
});
