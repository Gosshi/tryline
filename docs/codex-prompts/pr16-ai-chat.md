# feat: 試合別 AI チャット（SSE ストリーミング）

## 目的

試合詳細ページの最下部に AI チャットパネルを追加する。
ユーザーが日本語でラグビーの質問を投げると、
試合コンテキスト（スコア・イベント・ラインアップ・recap）をもとに
gpt-4o-mini がストリーミングで回答する。

初期リリースは **認証ガードなし（全ユーザー利用可）** とし、
Auth（pr18）実装後に Premium ガードを追加する。

**必ず `design.md` を最初に読んでから実装すること。**

## 参照すべきファイル

- `specs/p2-ai-chat.md` — 仕様書（データモデル・API 設計の権威文書）
- `lib/llm/models.ts` — モデル ID 定数（`MODELS.FAST` = gpt-4o-mini）
- `lib/db/queries/matches.ts` — `getMatchById`
- `lib/db/queries/match-content.ts` — `getPublishedContentForMatch`
- `app/matches/[id]/page.tsx` — ページ構成の参考
- `app/api/cron/orchestrate/route.ts` — OpenAI 呼び出しパターン参照

## Supabase マイグレーション

### `supabase/migrations/<timestamp>_add_chat_tables.sql`

```sql
-- chat_sessions
create table if not exists chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table chat_sessions enable row level security;
create policy "public insert" on chat_sessions for insert with check (true);
create policy "public select" on chat_sessions for select using (true);

-- chat_messages
create table if not exists chat_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references chat_sessions(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10, 6),
  created_at    timestamptz not null default now()
);

alter table chat_messages enable row level security;
create policy "public insert" on chat_messages for insert with check (true);
create policy "public select" on chat_messages for select using (true);

create index on chat_messages (session_id, created_at);
```

## 実装

### 1. `lib/db/queries/chat.ts` を新規作成

```ts
import { getSupabasePublicServerClient } from "@/lib/db/server";

export async function createChatSession(matchId: string): Promise<string> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("chat_sessions")
    .insert({ match_id: matchId })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to create session");
  return data.id;
}

export async function getChatMessages(
  sessionId: string,
): Promise<Array<{ role: string; content: string }>> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveChatMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  tokens?: { input: number; output: number; costUsd: number },
): Promise<void> {
  const client = getSupabasePublicServerClient();
  const { error } = await client.from("chat_messages").insert({
    session_id: sessionId,
    role,
    content,
    input_tokens: tokens?.input,
    output_tokens: tokens?.output,
    cost_usd: tokens?.costUsd,
  });
  if (error) throw error;
}

export async function getSessionTokenTotal(sessionId: string): Promise<number> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("chat_messages")
    .select("input_tokens, output_tokens")
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []).reduce(
    (sum, m) => sum + (m.input_tokens ?? 0) + (m.output_tokens ?? 0),
    0,
  );
}
```

---

### 2. `lib/chat/context.ts` を新規作成

試合コンテキストをシステムプロンプト文字列として組み立てる。

```ts
import { getMatchById } from "@/lib/db/queries/matches";
import { getPublishedContentForMatch } from "@/lib/db/queries/match-content";
import { formatCompetitionTitle } from "@/lib/format/competition";

export async function assembleMatchContext(matchId: string): Promise<string> {
  const [match, content] = await Promise.all([
    getMatchById(matchId),
    getPublishedContentForMatch(matchId),
  ]);

  if (!match) return "試合データがありません。";

  const competitionTitle = formatCompetitionTitle(
    match.competition.name,
    match.competition.season,
  );

  const lines: string[] = [
    `## 試合情報`,
    `大会: ${competitionTitle}`,
    `ホーム: ${match.homeTeam.name}`,
    `アウェイ: ${match.awayTeam.name}`,
    `会場: ${match.venue ?? "不明"}`,
    `日時: ${match.kickoffAt}`,
  ];

  if (match.status === "finished") {
    lines.push(
      `スコア: ${match.homeTeam.name} ${match.homeScore ?? 0} - ${match.awayScore ?? 0} ${match.awayTeam.name}`,
    );
  }

  if (content.recap) {
    lines.push(`\n## 試合レビュー（recap）`);
    lines.push(content.recap.contentMdJa.slice(0, 2000));
  }

  lines.push(
    `\n## 応答方針`,
    `- 日本語で回答する`,
    `- ラグビー用語は英語のままでよい（例: lineout, scrum）`,
    `- 推測・不確かな情報は「〜と思われます」と明示する`,
    `- 試合データに基づかない回答は避ける`,
  );

  return lines.join("\n");
}
```

---

### 3. `app/api/chat/[matchId]/route.ts` を新規作成

```ts
import OpenAI from "openai";

import { assembleMatchContext } from "@/lib/chat/context";
import {
  createChatSession,
  getChatMessages,
  getSessionTokenTotal,
  saveChatMessage,
} from "@/lib/db/queries/chat";
import { MODELS } from "@/lib/llm/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOKEN_LIMIT = 50_000;
const openai = new OpenAI();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  const body = (await request.json()) as { sessionId?: string; message: string };
  const userMessage = body.message?.trim();

  if (!userMessage) {
    return new Response("message is required", { status: 400 });
  }

  const sessionId = body.sessionId ?? (await createChatSession(matchId));

  const totalTokens = await getSessionTokenTotal(sessionId);
  if (totalTokens >= TOKEN_LIMIT) {
    return Response.json({ error: "token_limit_exceeded" }, { status: 429 });
  }

  const history = await getChatMessages(sessionId);
  await saveChatMessage(sessionId, "user", userMessage);

  const systemPrompt = await assembleMatchContext(matchId);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const stream = await openai.chat.completions.create({
    model: MODELS.FAST,
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: 1024,
  });

  const encoder = new TextEncoder();
  let assistantContent = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const readable = new ReadableStream({
    async start(controller) {
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

      const costUsd = (inputTokens * 0.00015 + outputTokens * 0.0006) / 1000;
      await saveChatMessage(sessionId, "assistant", assistantContent, {
        input: inputTokens,
        output: outputTokens,
        costUsd,
      });

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true, sessionId })}\n\n`),
      );
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

### 4. `components/match-chat.tsx` を新規作成

```tsx
"use client";

import { useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Props = { matchId: string };

export function MatchChat({ matchId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setStreaming(true);
    let assistantContent = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`/api/chat/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(
          data.error === "token_limit_exceeded"
            ? "トークン上限に達しました。ページを更新して新しいセッションを開始してください。"
            : "エラーが発生しました。",
        );
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as {
            delta?: string;
            done?: boolean;
            sessionId?: string;
          };
          if (data.delta) {
            assistantContent += data.delta;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: assistantContent };
              return next;
            });
          }
          if (data.done && data.sessionId) setSessionId(data.sessionId);
        }
      }
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setStreaming(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        AI チャット
      </h2>

      {messages.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[80%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900"
                  : "max-w-[80%] text-sm text-slate-800"
              }
            >
              {m.content}
              {streaming && i === messages.length - 1 && m.role === "assistant" && (
                <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-slate-400" />
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          placeholder="この試合について質問する…"
          type="text"
          value={input}
        />
        <button
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          disabled={streaming || !input.trim()}
          onClick={() => void send()}
          type="button"
        >
          送信
        </button>
      </div>
    </section>
  );
}
```

---

### 5. `app/matches/[id]/page.tsx` に `MatchChat` を追加

既存の `<main>` 内、最下部のセクションの後に追記する。

```tsx
import { MatchChat } from "@/components/match-chat";

// MatchDetailPage 内の return 末尾 </main> の直前
<MatchChat matchId={id} />
```

---

## 変更・作成するファイル

- `supabase/migrations/<timestamp>_add_chat_tables.sql`（新規作成）
- `lib/db/queries/chat.ts`（新規作成）
- `lib/chat/context.ts`（新規作成）
- `app/api/chat/[matchId]/route.ts`（新規作成）
- `components/match-chat.tsx`（新規作成）
- `app/matches/[id]/page.tsx`（`MatchChat` を末尾に追加）

## 変更しないこと

- `lib/db/queries/matches.ts` の既存関数
- `lib/llm/models.ts`
- `app/matches/[id]/page.tsx` の既存ページ構造（末尾への追加のみ）

## 完了条件

- `/matches/[id]` の最下部にチャット UI が表示されること
- メッセージ送信時にストリーミングで回答が流れること
- `chat_sessions`・`chat_messages` にレコードが保存されること
- 50,000 token 超過時にエラーメッセージが表示されること
- `pnpm tsc --noEmit` パス
- `pnpm build` 成功

## ブランチ・PR

- ブランチ: `feat/ai-chat`
- PR タイトル: `Feat: add AI chat panel to match detail pages`
