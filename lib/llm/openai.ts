import { getOpenAIClient } from "@/lib/llm/client";

import type OpenAI from "openai";

export type OpenAIUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type OpenAITextResponse = {
  text: string;
  model: string;
  usage: OpenAIUsage;
};

export async function createTextResponse(options: {
  model: string;
  input: string;
  temperature?: number;
}): Promise<OpenAITextResponse> {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: options.model,
    input: options.input,
    temperature: options.temperature,
  });

  return {
    text: response.output_text,
    model: response.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}

export type ResponsesCreate = OpenAI["responses"]["create"];
