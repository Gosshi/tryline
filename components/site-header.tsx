import Link from "next/link";

import { TrackedLink } from "@/components/tracked-link";
import { listAllTeams } from "@/lib/db/queries/teams";

import { CompetitionNavDropdown } from "./competition-nav-dropdown";
import { HeaderUserControls } from "./header-user-controls";
import { NoteIcon } from "./icons/note-icon";
import { XIcon } from "./icons/x-icon";
import { MobileHeaderMenu } from "./mobile-header-menu";

export async function SiteHeader() {
  const allTeams = await listAllTeams();

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

        <MobileHeaderMenu allTeams={allTeams} />

        <nav
          aria-label="メインナビゲーション"
          className="hidden items-center gap-2 md:flex"
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
            <li>
              <CompetitionNavDropdown />
            </li>
            <li>
              <TrackedLink
                analytics={{
                  cta_id: "site_header_calendar",
                  cta_location: "site_header",
                  destination: "calendar",
                  label: "カレンダー",
                }}
                className="-my-1.5 rounded px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0 sm:py-1.5"
                href="/calendar"
              >
                カレンダー
              </TrackedLink>
            </li>
          </ul>
          <a
            aria-label="X (Twitter) @tryline_rugbyjp"
            className="flex items-center rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href="https://x.com/tryline_rugbyjp"
            rel="noopener noreferrer"
            target="_blank"
          >
            <XIcon className="h-4 w-4" />
          </a>
          <a
            aria-label="note @tryline_rugbyjp"
            className="flex items-center rounded p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href="https://note.com/tryline_rugbyjp"
            rel="noopener noreferrer"
            target="_blank"
          >
            <NoteIcon className="h-4 w-12" />
          </a>
          <HeaderUserControls allTeams={allTeams} />
        </nav>
      </div>
    </header>
  );
}
