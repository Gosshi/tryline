import {
  getSupabaseServerClientWithAuth,
  getUser,
  getUserProfile,
  isPremium,
} from "@/lib/auth/server";
import { assembleMatchContext } from "@/lib/chat/context";
import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";

import type OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_MESSAGE_LIMIT = 30;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const user = await getUser();

  if (!user) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }

  if (!(await isPremium(user.id))) {
    return Response.json({ error: "premium_required" }, { status: 403 });
  }

  const profile = await getUserProfile(user.id);
  const supabase = await getSupabaseServerClientWithAuth();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const resetNeeded =
    !profile?.chat_daily_reset_date || profile.chat_daily_reset_date < today;
  const dailyCount = resetNeeded ? 0 : (profile?.chat_daily_count ?? 0);

  if (resetNeeded) {
    await supabase
      .from("user_profiles")
      .update({
        chat_daily_count: 0,
        chat_daily_reset_date: today,
        updated_at: now.toISOString(),
      })
      .eq("id", user.id);
  }

  if (dailyCount >= DAILY_MESSAGE_LIMIT) {
    return Response.json({ error: "daily_limit_exceeded" }, { status: 429 });
  }

  const body = (await request.json()) as {
    history?: Array<{ content: string; role: "user" | "assistant" }>;
    message?: string;
  };
  const userMessage = body.message?.trim();
  const history = body.history ?? [];

  if (!userMessage) {
    return Response.json({ error: "message_required" }, { status: 400 });
  }

  const systemPrompt = await assembleMatchContext(matchId);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { content: systemPrompt, role: "system" },
    ...history,
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

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";

          if (delta) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
            );
          }
        }

        await supabase
          .from("user_profiles")
          .update({
            chat_daily_count: dailyCount + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`),
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
