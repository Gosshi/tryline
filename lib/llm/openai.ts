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

type OpenAINonStreamingResponse = {
  output_text: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export async function createTextResponse(options: {
  model: string;
  input: string;
  temperature?: number;
  jsonMode?: boolean;
}): Promise<OpenAITextResponse> {
  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: options.model,
    input: options.input,
    temperature: options.temperature,
    ...(options.jsonMode ? { text: { format: { type: "json_object" } } } : {}),
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

export async function createWebSearchJsonResponse(options: {
  model: string;
  input: string;
  temperature?: number;
}): Promise<OpenAITextResponse> {
  const client = getOpenAIClient();

  const response = (await client.responses.create({
    model: options.model,
    input: options.input,
    temperature: options.temperature ?? 0,
    text: { format: { type: "json_object" } },
    tools: [{ type: "web_search_preview" }],
  } as Parameters<ResponsesCreate>[0])) as OpenAINonStreamingResponse;

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
