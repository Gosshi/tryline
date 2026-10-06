"use client";

import { useSyncExternalStore } from "react";

import { trackEvent } from "@/lib/analytics";
import {
  readSpoilerGuard,
  subscribeSpoilerGuard,
  writeSpoilerGuard,
} from "@/lib/spoiler-guard";
import { cn } from "@/lib/utils";

export function useSpoilerGuard() {
  return useSyncExternalStore(
    subscribeSpoilerGuard,
    readSpoilerGuard,
    () => false,
  );
}

export function SpoilerGuardToggle({
  location,
  className,
}: {
  location: string;
  className?: string;
}) {
  const enabled = useSpoilerGuard();
  return (
    <button
      aria-pressed={enabled}
      className={cn(
        "border-current/20 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2",
        className,
      )}
      onClick={() => {
        const next = writeSpoilerGuard(!enabled);
        trackEvent("spoiler_guard_toggle", {
          state: next ? "on" : "off",
          cta_location: location,
        });
      }}
      type="button"
    >
      スコアを隠す <span>{enabled ? "オン" : "オフ"}</span>
    </button>
  );
}
