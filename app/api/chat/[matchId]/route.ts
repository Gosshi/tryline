import { createClient } from "@supabase/supabase-js";

import {
  getSupabaseServerClientWithAuth,
  getUser,
  getUserProfile,
  isPremium,
} from "@/lib/auth/server";
import { assembleMatchContext } from "@/lib/chat/context";
import { getOpenAIClient } from "@/lib/llm/client";
import { MODELS } from "@/lib/llm/models";

import type { Database } from "@/lib/db/types";
import type OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_MESSAGE_LIMIT = 30;

function getSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const user = await getUser();

  if (!user) {
    return Response.json({ error: "login_required" }, { status: 401 });
  }

  const premium = await isPremium(user.id);
  const supabase = await getSupabaseServerClientWithAuth();

  if (!premium) {
    const { data: freeUsage } = await supabase
      .from("chat_free_questions")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("match_id", matchId)
      .maybeSingle();

    if (freeUsage) {
      return Response.json({ error: "free_question_used" }, { status: 403 });
    }
  }

  const profile = premium ? await getUserProfile(user.id) : null;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const resetNeeded =
    premium &&
    (!profile?.chat_daily_reset_date || profile.chat_daily_reset_date < today);
  const dailyCount = resetNeeded ? 0 : (profile?.chat_daily_count ?? 0);
  const counterSupabase = premium ? getSupabaseAdminClient() : null;

  if (resetNeeded) {
    await counterSupabase!
      .from("user_profiles")
      .update({
        chat_daily_count: 0,
        chat_daily_reset_date: today,
        updated_at: now.toISOString(),
      })
      .eq("id", user.id);
  }

  if (premium && dailyCount >= DAILY_MESSAGE_LIMIT) {
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

        if (premium) {
          await counterSupabase!
            .from("user_profiles")
            .update({
              chat_daily_count: dailyCount + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", user.id);
        } else {
          await supabase
            .from("chat_free_questions")
            .upsert(
              { match_id: matchId, user_id: user.id },
              { ignoreDuplicates: true },
            );
        }

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
