export const OPENAI_PRICING_USD_PER_1M_TOKENS = {
  "gpt-5.6-sol": {
    input: 5,
    output: 30,
  },
  "gpt-5.6-terra": {
    input: 2,
    output: 12,
  },
  "gpt-5.6-luna": {
    input: 0.2,
    output: 1.2,
  },
  "gpt-4o": {
    input: 2.5,
    output: 10,
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
} as const;

const PRICEABLE_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-4o-mini",
  "gpt-4o",
] as const;

export function normalizeModelForPricing(
  modelVersion: string,
): keyof typeof OPENAI_PRICING_USD_PER_1M_TOKENS {
  const model = PRICEABLE_MODELS.find((candidate) =>
    modelVersion.startsWith(candidate),
  );

  if (!model) {
    throw new Error(`Unsupported model for pricing: ${modelVersion}`);
  }

  return model;
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
