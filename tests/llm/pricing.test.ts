import { describe, expect, it } from "vitest";

import {
  calculateCostUsd,
  normalizeModelForPricing,
  OPENAI_PRICING_USD_PER_1M_TOKENS,
} from "@/lib/llm/pricing";

describe("OpenAI pricing", () => {
  it("defines the GPT-5.6 model prices", () => {
    expect(OPENAI_PRICING_USD_PER_1M_TOKENS["gpt-5.6-sol"]).toEqual({
      input: 4,
      output: 20,
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

  it("prices GPT-6 models and their snapshot versions", () => {
    expect(
      calculateCostUsd({
        inputTokens: 1_000_000,
        modelVersion: "gpt-6-astra-2026-09-03",
        outputTokens: 1_000_000,
      }),
    ).toBe(60);
    expect(
      calculateCostUsd({
        inputTokens: 1_000_000,
        modelVersion: "gpt-6-sol-2026-09-22",
        outputTokens: 1_000_000,
      }),
    ).toBe(12);
    expect(
      calculateCostUsd({
        inputTokens: 1_000_000,
        modelVersion: "gpt-6-luna-2026-09-22",
        outputTokens: 1_000_000,
      }),
    ).toBe(0.6);
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
