"use client";

import { useEffect, useRef, useState } from "react";

import { Paywall } from "@/components/paywall";

type Message = {
  content: string;
  role: "user" | "assistant";
};

type MatchChatProps = {
  hasFreeQuestion: boolean | null;
  isLoggedIn: boolean | null;
  isPremium: boolean | null;
  matchId: string;
};

const SAMPLE_QA = [
  {
    a: "記録された得点経過をもとに、リードが動いた時間帯と両チームのスコア推移を整理します。",
    q: "この試合の得点の流れを教えて",
  },
  {
    a: "公開済みのレビューと試合データをもとに、両チームの違いを確認できる範囲で説明します。",
    q: "両チームの試合内容の違いは？",
  },
  {
    a: "今節の結果が順位争いやプレーオフレースに与える影響と、両チームが次に向けて修正すべき点をまとめます。",
    q: "この結果は次の試合にどうつながる？",
  },
];

function MatchChatPanel({
  disabled = false,
  matchId,
  onFreeQuestionUsed,
}: {
  disabled?: boolean;
  matchId: string;
  onFreeQuestionUsed?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  function scrollToBottom() {
    const element = containerRef.current;

    if (!element || !isAtBottomRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      const currentElement = containerRef.current;

      if (!currentElement || !isAtBottomRef.current) {
        return;
      }

      currentElement.scrollTop = currentElement.scrollHeight;
    });
  }

  async function send() {
    const message = input.trim();

    if (!message || streaming) {
      return;
    }

    setInput("");
    setError(null);
    const nextMessages: Message[] = [
      ...messages,
      { content: message, role: "user" },
      { content: "", role: "assistant" },
    ];

    setMessages(nextMessages);
    scrollToBottom();
    setStreaming(true);

    let assistantContent = "";

    try {
      const response = await fetch(`/api/chat/${matchId}`, {
        body: JSON.stringify({
          history: nextMessages
            .slice(0, -2)
            .map(({ content, role }) => ({ content, role })),
          message,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        if (data.error === "free_question_used") {
          onFreeQuestionUsed?.();
          setError("1問使用済みです。続きは Premium でご利用ください。");
          return;
        }

        setError(
          data.error === "daily_limit_exceeded"
            ? "1 日のメッセージ上限（30 件）に達しました。明日またご利用ください。"
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
            scrollToBottom();
          }

          if (data.done) {
            // Conversation history is intentionally kept only in React state.
            onFreeQuestionUsed?.();
          }
        }
      }
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  }

  return (
    <div className="space-y-4">
      {messages.length > 0 && (
        <div
          className="max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4"
          onScroll={() => {
            const element = containerRef.current;

            if (!element) {
              return;
            }

            isAtBottomRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              40;
          }}
          ref={containerRef}
        >
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
    </div>
  );
}

function SampleQaList() {
  return (
    <div className="mt-5 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        SAMPLE Q&A
      </p>
      <div className="space-y-4">
        {SAMPLE_QA.map((sample) => (
          <div className="space-y-1" key={sample.q}>
            <p className="text-sm font-semibold text-slate-900">
              Q. {sample.q}
            </p>
            <p className="text-sm leading-6 text-slate-600">A. {sample.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatchChat({
  hasFreeQuestion: initialHasFreeQuestion,
  isLoggedIn,
  isPremium,
  matchId,
}: MatchChatProps) {
  const [hasFreeQuestion, setHasFreeQuestion] = useState<boolean | null>(
    initialHasFreeQuestion,
  );

  useEffect(() => {
    setHasFreeQuestion(initialHasFreeQuestion);
  }, [initialHasFreeQuestion]);

  const showSamples = isPremium !== true;

  return (
    <section className="rounded-[var(--radius-md)] bg-white p-5 text-center shadow-[var(--shadow-soft)] sm:p-7">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          AI CHAT
        </p>
        <h2 className="mt-1 text-lg font-black text-[var(--color-ink)]">
          この試合について質問する
        </h2>
      </div>

      {isPremium ? (
        <MatchChatPanel matchId={matchId} />
      ) : isPremium === null || hasFreeQuestion === null ? (
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      ) : !isLoggedIn ? (
        <>
          <p className="mb-3 text-sm text-slate-600">
            ログインすると1問まで無料で試せます
          </p>
          <a
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[19px] bg-gradient-to-br from-[#c93a40] to-[#a83464] px-5 py-3 text-sm font-bold text-white shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto"
            href="/auth/login"
          >
            ログインして試す
          </a>
          {showSamples && <SampleQaList />}
        </>
      ) : hasFreeQuestion ? (
        <>
          <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            この試合1問まで無料
          </div>
          <MatchChatPanel
            matchId={matchId}
            onFreeQuestionUsed={() => setHasFreeQuestion(false)}
          />
          {showSamples && <SampleQaList />}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-700">
            1問使用済み。続きは Premium で
          </p>
          <Paywall contentType="chat" isPremium={false} matchId={matchId}>
            <MatchChatPanel disabled matchId={matchId} />
          </Paywall>
          {showSamples && <SampleQaList />}
        </>
      )}
    </section>
  );
}
