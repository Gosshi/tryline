"use client";

import { useRef, useState } from "react";

import { Paywall } from "@/components/paywall";

type Message = {
  content: string;
  role: "user" | "assistant";
};

type MatchChatProps = {
  isPremium: boolean;
  matchId: string;
};

function MatchChatPanel({
  disabled = false,
  matchId,
}: {
  disabled?: boolean;
  matchId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send() {
    const message = input.trim();

    if (!message || streaming) {
      return;
    }

    setInput("");
    setError(null);
    setMessages((previous) => [
      ...previous,
      { content: message, role: "user" },
      { content: "", role: "assistant" },
    ]);
    setStreaming(true);

    let assistantContent = "";

    try {
      const response = await fetch(`/api/chat/${matchId}`, {
        body: JSON.stringify({ message, sessionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(
          data.error === "token_limit_exceeded"
            ? "トークン上限に達しました。ページを更新して新しいセッションを開始してください。"
            : "エラーが発生しました。",
        );
        return;
      }

      const reader = response.body?.getReader();

      if (!reader) {
        setError("通信エラーが発生しました。");
        return;
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) {
            continue;
          }

          const data = JSON.parse(line.slice(6)) as {
            delta?: string;
            done?: boolean;
            error?: string;
            sessionId?: string;
          };

          if (data.error) {
            setError("エラーが発生しました。");
          }

          if (data.delta) {
            assistantContent += data.delta;
            setMessages((previous) => {
              const next = [...previous];
              next[next.length - 1] = {
                content: assistantContent,
                role: "assistant",
              };
              return next;
            });
          }

          if (data.done && data.sessionId) {
            setSessionId(data.sessionId);
          }
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
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          AI Chat
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          AI チャット
        </h2>
      </div>

      {messages.length > 0 && (
        <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4">
          {messages.map((message, index) => (
            <div
              className={
                message.role === "user"
                  ? "ml-auto max-w-[86%] whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                  : "max-w-[86%] whitespace-pre-wrap text-sm leading-7 text-slate-800"
              }
              key={`${message.role}-${index}`}
            >
              {message.content}
              {streaming &&
                index === messages.length - 1 &&
                message.role === "assistant" && (
                  <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-slate-400 align-text-bottom" />
                )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          className="min-h-11 flex-1 resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          disabled={disabled || streaming}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="この試合について質問する..."
          rows={2}
          value={input}
        />
        <button
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] px-5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          disabled={disabled || streaming || !input.trim()}
          onClick={() => void send()}
          type="button"
        >
          送信
        </button>
      </div>
    </section>
  );
}

export function MatchChat({ isPremium, matchId }: MatchChatProps) {
  if (!isPremium) {
    return (
      <Paywall isPremium={false}>
        <MatchChatPanel disabled matchId={matchId} />
      </Paywall>
    );
  }

  return <MatchChatPanel matchId={matchId} />;
}
