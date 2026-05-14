"use client";

import Link from "next/link";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

import { AuthModal } from "./auth-modal";
import { NotificationSettings } from "./notification-settings";
import { TeamPicker, type TeamOption } from "./team-picker";

import type { User } from "@supabase/supabase-js";

type UserMenuProps = {
  allTeams: TeamOption[];
  favoriteTeamSlugs: string[];
  isPremium: boolean;
  user: User | null;
};

export function UserMenu({
  allTeams,
  favoriteTeamSlugs,
  isPremium,
  user,
}: UserMenuProps) {
  const [showModal, setShowModal] = useState(false);
  const [open, setOpen] = useState(false);
  const favoriteTeams = favoriteTeamSlugs
    .map((slug) => allTeams.find((team) => team.slug === slug))
    .filter((team): team is TeamOption => team !== undefined);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    location.reload();
  }

  if (!user) {
    return (
      <>
        <button
          className="min-h-[44px] rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:min-h-0 sm:py-1.5"
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
        className="flex min-h-[44px] items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:min-h-0 sm:py-1.5"
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
        <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
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
          {favoriteTeams.length > 0 && (
            <div className="space-y-0.5 border-t border-slate-100 px-4 py-2">
              {favoriteTeams.map((team) => (
                <Link
                  className="block py-1 text-xs font-medium text-[var(--color-accent)] hover:underline"
                  href={`/t/${team.slug}`}
                  key={team.slug}
                  onClick={() => setOpen(false)}
                >
                  {team.name} のページ →
                </Link>
              ))}
            </div>
          )}
          <div className="border-t border-slate-100 px-4 py-3">
            <TeamPicker
              initialSelected={favoriteTeamSlugs}
              teams={allTeams}
            />
          </div>
          <div className="border-t border-slate-100 px-4 py-2">
            <NotificationSettings initialTeamSlugs={favoriteTeamSlugs} />
          </div>
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
