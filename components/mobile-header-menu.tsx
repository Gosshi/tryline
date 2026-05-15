"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthModal } from "@/components/auth-modal";
import { HEADER_COMPETITIONS } from "@/components/competition-nav-dropdown";
import { UserMenu } from "@/components/user-menu";
import { getCompetitionFamilyColor } from "@/lib/format/competition";

import type { TeamOption } from "@/components/team-picker";
import type { User } from "@supabase/supabase-js";

type MobileHeaderMenuProps = {
  allTeams: TeamOption[];
  favoriteTeamSlugs: string[];
  isPremium: boolean;
  user: User | null;
};

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MobileHeaderMenu({
  allTeams,
  favoriteTeamSlugs,
  isPremium,
  user,
}: MobileHeaderMenuProps) {
  const [showAuth, setShowAuth] = useState(false);
  const [isCompetitionsOpen, setIsCompetitionsOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
    setIsCompetitionsOpen(false);
  }

  return (
    <>
      {showAuth && (
        <AuthModal
          intent="login"
          onClose={() => {
            setShowAuth(false);
          }}
        />
      )}

      <button
        aria-controls="mobile-site-menu"
        aria-expanded={isOpen}
        aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
        className="rounded p-2 text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] md:hidden"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {isOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={closeMenu}
        >
          <div
            className="absolute inset-x-0 top-14 border-t border-slate-200 bg-white shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <nav
              aria-label="モバイルナビゲーション"
              className="px-4 py-2"
              id="mobile-site-menu"
            >
              <ul className="flex flex-col">
                <li>
                  <Link
                    className="block min-h-[44px] px-2 py-3 text-sm font-medium text-slate-700"
                    href="/"
                    onClick={closeMenu}
                  >
                    試合
                  </Link>
                </li>
                <li>
                  <button
                    aria-expanded={isCompetitionsOpen}
                    className="flex min-h-[44px] w-full items-center justify-between px-2 py-3 text-left text-sm font-medium text-slate-700"
                    onClick={() =>
                      setIsCompetitionsOpen((current) => !current)
                    }
                    type="button"
                  >
                    <span>大会</span>
                    <span aria-hidden="true" className="text-xs text-slate-500">
                      {isCompetitionsOpen ? "▴" : "▾"}
                    </span>
                  </button>
                  {isCompetitionsOpen && (
                    <ul className="pb-2">
                      {HEADER_COMPETITIONS.map((competition) => (
                        <li key={competition.href}>
                          <Link
                            className="block min-h-[44px] border-l-[3px] px-4 py-3 text-sm text-slate-600"
                            href={competition.href}
                            onClick={closeMenu}
                            style={{
                              borderLeftColor: getCompetitionFamilyColor(
                                competition.family,
                              ),
                            }}
                          >
                            {competition.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
                {!user && (
                  <li>
                    <Link
                      className="block min-h-[44px] px-2 py-3 text-sm font-medium text-slate-700"
                      href="/pricing"
                      onClick={closeMenu}
                    >
                      料金
                    </Link>
                  </li>
                )}
              </ul>

              <div className="mt-2 border-t border-slate-200 pt-2">
                {user ? (
                  <UserMenu
                    allTeams={allTeams}
                    favoriteTeamSlugs={favoriteTeamSlugs}
                    isPremium={isPremium}
                    user={user}
                  />
                ) : (
                  <button
                    className="block min-h-[44px] w-full px-2 py-3 text-left text-sm font-medium text-slate-700"
                    onClick={() => {
                      closeMenu();
                      setShowAuth(true);
                    }}
                    type="button"
                  >
                    ログイン
                  </button>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
