import Link from "next/link";

import { getUser, getUserProfile } from "@/lib/auth/server";
import { listAllTeams } from "@/lib/db/queries/teams";

import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const [user, allTeams] = await Promise.all([getUser(), listAllTeams()]);
  const profile = user ? await getUserProfile(user.id) : null;
  const premium = profile?.subscription_status === "premium";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
        <Link
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href="/"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
          <span className="text-xl font-black tracking-tight text-slate-950">
            Tryline
          </span>
        </Link>

        <nav
          aria-label="メインナビゲーション"
          className="flex items-center gap-2"
        >
          <ul className="flex items-center gap-1">
            <li>
              <Link
                className="-my-1.5 rounded px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0 sm:py-1.5"
                href="/"
              >
                試合
              </Link>
            </li>
            {!user && (
              <li>
                <Link
                  className="-my-1.5 rounded px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0 sm:py-1.5"
                  href="/pricing"
                >
                  料金
                </Link>
              </li>
            )}
          </ul>
          <UserMenu
            allTeams={allTeams}
            favoriteTeamSlugs={profile?.favorite_team_slugs ?? []}
            isPremium={premium}
            user={user}
          />
        </nav>
      </div>
    </header>
  );
}
