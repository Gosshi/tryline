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
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-rule)] bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
        <Link
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href="/"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
          <span className="text-xl font-black tracking-tight text-[var(--color-ink)]">
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
                className="-my-1.5 inline-flex min-h-11 items-center rounded-full border border-[var(--color-rule)] px-3 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0"
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
                className="-my-1.5 inline-flex min-h-11 items-center rounded-full border border-[var(--color-rule)] px-3 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0"
                href="/calendar"
              >
                カレンダー
              </TrackedLink>
            </li>
          </ul>
          <a
            aria-label="X (Twitter) @tryline_rugbyjp"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-rule)] p-2 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href="https://x.com/tryline_rugbyjp"
            rel="noopener noreferrer"
            target="_blank"
          >
            <XIcon className="h-4 w-4" />
          </a>
          <a
            aria-label="note @tryline_rugbyjp"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-rule)] p-2 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
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
