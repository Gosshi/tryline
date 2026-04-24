export const OPENAI_PRICING_USD_PER_1M_TOKENS = {
  "gpt-4o": {
    input: 2.5,
    output: 10,
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
} as const;

export function normalizeModelForPricing(modelVersion: string): keyof typeof OPENAI_PRICING_USD_PER_1M_TOKENS {
  if (modelVersion.startsWith("gpt-4o-mini")) {
    return "gpt-4o-mini";
  }

  return "gpt-4o";
}

export function calculateCostUsd(options: {
  modelVersion: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const modelKey = normalizeModelForPricing(options.modelVersion);
  const pricing = OPENAI_PRICING_USD_PER_1M_TOKENS[modelKey];

  const inputCost = (options.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (options.outputTokens / 1_000_000) * pricing.output;

  return Number((inputCost + outputCost).toFixed(6));
}
