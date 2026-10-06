"use client";

import { useState } from "react";

import { useMatchSpoiler } from "@/components/match-spoiler-boundary";
import { useSpoilerGuard } from "@/components/spoiler-guard-toggle";
import { MotionCountGate } from "@/components/touchline-motion";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type SpoilerScoreProps = {
  children: ReactNode;
  className?: string;
  location?: string;
  label?: string;
};

export function SpoilerScore({
  children,
  className,
  location = "score",
  label = "タップして結果を見る",
}: SpoilerScoreProps) {
  const enabled = useSpoilerGuard();
  const matchSpoiler = useMatchSpoiler();
  const [revealedFor, setRevealedFor] = useState<boolean | null>(null);
  if (revealedFor !== null && revealedFor !== enabled) setRevealedFor(null);
  const revealed = matchSpoiler?.revealed ?? revealedFor === true;
  const revealLabel = matchSpoiler ? "スコアを表示" : label;

  function reveal(event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (matchSpoiler) matchSpoiler.reveal();
    else setRevealedFor(true);
    trackEvent("spoiler_reveal", { cta_location: matchSpoiler ? "match_header" : location });
  }

  function revealWithKeyboard(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    reveal(event);
  }

  return (
    <span data-spoiler-score data-spoiler-revealed={revealed ? "true" : undefined}>
      <span data-spoiler-value>
        <MotionCountGate disabled={enabled}>{children}</MotionCountGate>
      </span>
      <span
        aria-label={revealLabel}
        className={cn(
          "border-current/20 bg-current/5 inline-flex cursor-pointer select-none items-center justify-center rounded-full border px-3 py-1 text-center text-xs font-bold leading-tight",
          className,
        )}
        data-spoiler-reveal
        onClick={reveal}
        onKeyDown={revealWithKeyboard}
        role="button"
        tabIndex={0}
      >
        {revealLabel}
      </span>
    </span>
  );
}
