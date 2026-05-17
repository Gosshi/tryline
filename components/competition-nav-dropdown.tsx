"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getCompetitionFamilyColor } from "@/lib/format/competition";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const HEADER_COMPETITIONS = [
  {
    family: "six-nations",
    href: "/c/six-nations/2025",
    label: "Six Nations 2025",
  },
  {
    family: "premiership",
    href: "/c/premiership/2025-26",
    label: "Premiership 2025-26",
  },
  {
    family: "urc",
    href: "/c/urc/2025-26",
    label: "URC 2025-26",
  },
  {
    family: "top-14",
    href: "/c/top-14/2024-25",
    label: "Top 14 2024-25",
  },
  {
    family: "super-rugby-pacific",
    href: "/c/super-rugby-pacific/2026",
    label: "Super Rugby Pacific 2026",
  },
  {
    family: "rugby-championship",
    href: "/c/rugby-championship/2025",
    label: "Rugby Championship 2025",
  },
  {
    family: "rwc",
    href: "/c/rwc/2023",
    label: "RWC 2023",
  },
  {
    family: "rwc",
    href: "/c/rwc/2027",
    label: "RWC 2027",
  },
  {
    family: "league-one",
    href: "/c/league-one",
    label: "ジャパンラグビー リーグワン",
  },
  {
    family: "autumn-nations",
    href: "/c/autumn-nations",
    label: "Autumn Nations",
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
        className="-my-1.5 flex min-h-[44px] items-center gap-1 rounded px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:my-0 sm:min-h-0 sm:py-1.5"
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
          className="absolute left-1/2 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white py-1 shadow-lg sm:left-auto sm:right-0 sm:w-64 sm:translate-x-0"
          role="listbox"
        >
          {HEADER_COMPETITIONS.map((competition) => (
            <li aria-selected="false" key={competition.href} role="option">
              <Link
                className="block border-l-[3px] px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
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
