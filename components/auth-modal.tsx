"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

type AuthModalProps = {
  intent?: "login" | "subscribe";
  onClose: () => void;
};

const GENERIC_ERROR_MESSAGE = "エラーが発生しました。";

function getAuthErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return GENERIC_ERROR_MESSAGE;
  }

  const { code, message, status } = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  const normalizedCode = typeof code === "string" ? code.toLowerCase() : "";
  const normalizedMessage =
    typeof message === "string" ? message.toLowerCase() : "";

  if (
    status === 400 &&
    (normalizedCode.includes("invalid") ||
      normalizedMessage.includes("invalid format") ||
      normalizedMessage.includes("validate email"))
  ) {
    return "メールアドレスの形式が正しくありません。";
  }

  if (
    status === 429 ||
    normalizedCode.includes("rate") ||
    normalizedMessage.includes("rate limit")
  ) {
    return "時間をおいてお試しください。";
  }

  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("failed to fetch")
  ) {
    return "通信に失敗しました。";
  }

  return GENERIC_ERROR_MESSAGE;
}

function isPlausibleEmail(email: string): boolean {
  const atIndex = email.indexOf("@");

  return atIndex > 0 && atIndex < email.length - 1 && !/\s/.test(email);
}

export function AuthModal({
  intent = "login",
  onClose,
}: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR_MESSAGE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  async function submit() {
    const normalizedEmail = email.trim();

    setEmail(normalizedEmail);
    if (!normalizedEmail) {
      setErrorMessage("メールアドレスを入力してください。");
      setState("error");
      return;
    }

    if (!isPlausibleEmail(normalizedEmail)) {
      setErrorMessage("メールアドレスの形式が正しくありません。");
      setState("error");
      return;
    }

    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setState("idle");
    const supabase = getSupabaseBrowserClient();

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });

      if (error) {
        setErrorMessage(getAuthErrorMessage(error));
        setState("error");
      } else {
        setState("sent");
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setState("error");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setState("idle");
    const supabase = getSupabaseBrowserClient();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMessage(getAuthErrorMessage(error));
        setState("error");
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setState("error");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (!mounted) return null;

  const title = intent === "subscribe" ? "Premium を始める" : "ログイン";
  const description =
    intent === "subscribe"
      ? "ログイン後、自動的に決済ページに移動します。"
      : null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div className="flex min-h-[100dvh] items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:min-h-full sm:items-center sm:p-0">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
          {state === "sent" ? (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              メールを送りました。リンクをクリックしてログインしてください。
            </p>
          ) : (
            <>
              {state === "error" && (
                <p className="mb-3 mt-4 text-sm text-red-600">
                  {errorMessage}
                </p>
              )}
              <button
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                disabled={isSubmitting}
                onClick={() => void handleGoogleLogin()}
                type="button"
              >
                <Image
                  alt=""
                  aria-hidden="true"
                  height={16}
                  src="/google-logo.svg"
                  width={16}
                />
                Google でログイン
              </button>
              <div className="relative my-4 flex items-center">
                <div className="flex-1 border-t border-slate-200" />
                <span className="mx-3 text-xs text-slate-400">または</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
              <input
                className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="メールアドレス"
                type="email"
                value={email}
              />
              <button
                className="w-full rounded-lg bg-[var(--color-accent)] py-2 text-sm font-semibold text-white hover:opacity-90"
                disabled={isSubmitting}
                onClick={() => void submit()}
                type="button"
              >
                Magic Link を送る
              </button>
            </>
          )}
          <button
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
