"use client";

import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

import { AuthModal } from "./auth-modal";

import type { User } from "@supabase/supabase-js";

type UserMenuProps = {
  isPremium: boolean;
  user: User | null;
};

export function UserMenu({ isPremium, user }: UserMenuProps) {
  const [showModal, setShowModal] = useState(false);
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    location.reload();
  }

  if (!user) {
    return (
      <>
        <button
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          onClick={() => setShowModal(true)}
          type="button"
        >
          ログイン
        </button>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {isPremium && (
          <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            Premium
          </span>
        )}
        {user.email?.split("@")[0]}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {!isPremium && (
            <a
              className="block px-4 py-2.5 text-xs font-semibold text-[var(--color-accent)] hover:bg-slate-50"
              href="/pricing"
            >
              Premium にアップグレード
            </a>
          )}
          {isPremium && (
            <a
              className="block px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50"
              href="/api/stripe/portal"
            >
              プランを管理する
            </a>
          )}
          <button
            className="block w-full px-4 py-2.5 text-left text-xs text-slate-600 hover:bg-slate-50"
            onClick={() => void signOut()}
            type="button"
          >
            サインアウト
          </button>
        </div>
      )}
    </div>
  );
}
