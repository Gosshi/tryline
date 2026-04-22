import OpenAI from "openai";

import { getServerEnv, hasConfiguredValue } from "@/lib/env";

let openAIClient: OpenAI | undefined;

export function getOpenAIClient() {
  if (!openAIClient) {
    const { OPENAI_API_KEY } = getServerEnv();

    if (!hasConfiguredValue(OPENAI_API_KEY)) {
      throw new Error("OPENAI_API_KEY is empty. Add a value in .env.local before using the API.");
    }

    openAIClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }

  return openAIClient;
}
