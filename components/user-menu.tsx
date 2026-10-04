"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

import { AuthModal } from "./auth-modal";
import { NotificationSettings } from "./notification-settings";
import { TeamPicker, type TeamOption } from "./team-picker";
import { TrackedLink } from "./tracked-link";

import type { User } from "@supabase/supabase-js";

type UserMenuProps = {
  allTeams: TeamOption[];
  favoriteTeamSlugs: string[];
  initialSpoilerGuard?: boolean;
  isPremium: boolean;
  user: User | null;
};

function NotificationQueryOpen({
  onOpen,
}: {
  onOpen: (open: boolean) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("notifications") === "open") {
      onOpen(true);
    }
  }, [onOpen, searchParams]);

  return null;
}

export function UserMenu({
  allTeams,
  favoriteTeamSlugs,
  initialSpoilerGuard = false,
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
          className="min-h-11 rounded-full border border-[var(--color-rule)] px-3 py-2 text-xs font-semibold text-[var(--color-ink)] hover:border-[var(--color-ink-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:min-h-0 sm:py-1.5"
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
    <>
      <Suspense fallback={null}>
        <NotificationQueryOpen onOpen={setOpen} />
      </Suspense>
      <div className="relative">
        <button
          className="flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-rule)] px-3 py-2 text-xs font-semibold text-[var(--color-ink)] hover:border-[var(--color-ink-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:min-h-0 sm:py-1.5"
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
          <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-sm border border-[var(--color-rule)] bg-card shadow-[var(--shadow)]">
            {!isPremium && (
              <TrackedLink
                analytics={{
                  cta_id: "user_menu_upgrade",
                  cta_location: "user_menu",
                  destination: "pricing",
                  label: "Premium にアップグレード",
                }}
                className="block px-4 py-2.5 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-panel)]"
                href="/pricing"
              >
                Premium にアップグレード
              </TrackedLink>
            )}
            {isPremium && (
              <a
                className="block px-4 py-2.5 text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)]"
                href="/api/stripe/portal"
              >
                プランを管理する
              </a>
            )}
            {favoriteTeams.length > 0 && (
              <div className="space-y-0.5 border-t border-[var(--color-rule)] px-4 py-2">
                {favoriteTeams.map((team) => (
                  <Link
                    className="block py-1 text-xs font-medium text-[var(--color-accent)] hover:underline"
                    href={`/teams/${team.slug}`}
                    key={team.slug}
                    onClick={() => setOpen(false)}
                  >
                    {team.name} のページ →
                  </Link>
                ))}
              </div>
            )}
            <div className="border-t border-[var(--color-rule)] px-4 py-3">
              <TeamPicker
                initialSelected={favoriteTeamSlugs}
                teams={allTeams}
              />
            </div>
            <div className="border-t border-[var(--color-rule)] px-4 py-2">
              <NotificationSettings
                initialSpoilerGuard={initialSpoilerGuard}
                initialTeamSlugs={favoriteTeamSlugs}
              />
            </div>
            <button
              className="block w-full px-4 py-2.5 text-left text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-panel)]"
              onClick={() => void signOut()}
              type="button"
            >
              サインアウト
            </button>
          </div>
        )}
      </div>
    </>
  );
}
