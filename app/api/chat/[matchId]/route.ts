import { assembleMatchContext } from "@/lib/chat/context";
import {
  createChatSession,
  getChatMessages,
  getSessionTokenTotal,
  saveChatMessage,
} from "@/lib/db/queries/chat";
import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";

import type OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOKEN_LIMIT = 50_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const body = (await request.json()) as {
    message?: string;
    sessionId?: string;
  };
  const userMessage = body.message?.trim();

  if (!userMessage) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }

  const sessionId = body.sessionId ?? (await createChatSession(matchId));
  const totalTokens = await getSessionTokenTotal(sessionId);

  if (totalTokens >= TOKEN_LIMIT) {
    return Response.json({ error: "token_limit_exceeded" }, { status: 429 });
  }

  const [history, systemPrompt] = await Promise.all([
    getChatMessages(sessionId),
    assembleMatchContext(matchId),
  ]);

  await saveChatMessage(sessionId, "user", userMessage);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { content: systemPrompt, role: "system" },
    ...history.map((message) => ({
      content: message.content,
      role: message.role,
    })),
    { content: userMessage, role: "user" },
  ];
  const stream = await getOpenAIClient().chat.completions.create({
    max_tokens: 1024,
    messages,
    model: MODELS.FAST,
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.5,
  });
  const encoder = new TextEncoder();
  let assistantContent = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";

          if (delta) {
            assistantContent += delta;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
            );
          }

          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens;
            outputTokens = chunk.usage.completion_tokens;
          }
        }

        const costUsd = (inputTokens * 0.00015 + outputTokens * 0.0006) / 1_000;
        await saveChatMessage(sessionId, "assistant", assistantContent, {
          costUsd,
          input: inputTokens,
          output: outputTokens,
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, sessionId })}\n\n`,
          ),
        );
        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "stream_failed" })}\n\n`,
          ),
        );
        controller.error(error);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
