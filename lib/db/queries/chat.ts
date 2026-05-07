import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type ChatMessageRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

type ChatMessageRow = {
  content: string;
  role: string;
};

export async function createChatSession(matchId: string): Promise<string> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("chat_sessions")
    .insert({ match_id: matchId })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to create chat session.");
  }

  return data.id;
}

export async function getChatMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ChatMessageRow[])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      content: message.content,
      role: message.role as ChatMessageRole,
    }));
}

export async function saveChatMessage(
  sessionId: string,
  role: ChatMessageRole,
  content: string,
  tokens?: { input: number; output: number; costUsd: number },
): Promise<void> {
  const client = getSupabasePublicServerClient();
  const { error } = await client.from("chat_messages").insert({
    content,
    cost_usd: tokens?.costUsd,
    input_tokens: tokens?.input,
    output_tokens: tokens?.output,
    role,
    session_id: sessionId,
  });

  if (error) {
    throw error;
  }
}

export async function getSessionTokenTotal(sessionId: string): Promise<number> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("chat_messages")
    .select("input_tokens, output_tokens")
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }

  return (data ?? []).reduce(
    (sum, message) =>
      sum + (message.input_tokens ?? 0) + (message.output_tokens ?? 0),
    0,
  );
}
