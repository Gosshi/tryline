"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getCompetitionFamilyColor } from "@/lib/format/competition";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const HEADER_COMPETITIONS = [
  {
    family: "six-nations",
    href: "/c/six-nations",
    label: "シックスネイションズ",
  },
  {
    family: "premiership",
    href: "/c/premiership",
    label: "プレミアシップ",
  },
  {
    family: "urc",
    href: "/c/urc",
    label: "ユナイテッド・ラグビー・チャンピオンシップ",
  },
  {
    family: "top-14",
    href: "/c/top-14",
    label: "トップ14",
  },
  {
    family: "super-rugby-pacific",
    href: "/c/super-rugby-pacific",
    label: "スーパーラグビー・パシフィック",
  },
  {
    family: "rugby-championship",
    href: "/c/rugby-championship",
    label: "ザ・ラグビーチャンピオンシップ",
  },
  {
    family: "nations-championship",
    href: "/c/nations-championship",
    label: "ネーションズチャンピオンシップ",
  },
  {
    family: "rwc",
    href: "/c/rwc",
    label: "ラグビーワールドカップ",
  },
  {
    family: "league-one",
    href: "/c/league-one",
    label: "ジャパンラグビー リーグワン",
  },
  {
    family: "autumn-nations",
    href: "/c/autumn-nations",
    label: "オータムネーションズシリーズ",
  },
  {
    family: "lipovitan-challenge-cup",
    href: "/c/lipovitan-challenge-cup",
    label: "リポビタンDチャレンジカップ",
  },
  {
    family: "pnc",
    href: "/c/pnc",
    label: "パシフィック・ネーションズカップ",
  },
] as const;

export function CompetitionNavDropdown() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleButtonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="-my-1.5 flex min-h-11 items-center gap-1 rounded-full border border-[var(--color-rule)] px-3 text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        type="button"
      >
        大会
        <span aria-hidden="true" className="text-xs leading-none opacity-60">
          ▾
        </span>
      </button>

      {open && (
        <ul
          className="absolute left-1/2 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-[var(--color-rule)] bg-card py-1 shadow-[var(--shadow)] sm:left-auto sm:right-0 sm:w-64 sm:translate-x-0"
          role="listbox"
        >
          {HEADER_COMPETITIONS.map((competition) => (
            <li aria-selected="false" key={competition.href} role="option">
              <Link
                className="block border-l-[3px] px-4 py-2 text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-panel)] focus:bg-[var(--color-panel)] focus:outline-none"
                href={competition.href}
                onClick={() => setOpen(false)}
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
    </div>
  );
}
