"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

type AuthModalProps = {
  intent?: "login" | "subscribe";
  onClose: () => void;
};

export function AuthModal({
  intent = "login",
  onClose,
}: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  async function submit() {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    setState(error ? "error" : "sent");
  }

  async function handleGoogleLogin() {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState("error");
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
                  エラーが発生しました。
                </p>
              )}
              <button
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
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
