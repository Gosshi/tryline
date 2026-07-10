"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type SpoilerScoreProps = {
  children: ReactNode;
  className?: string;
  enabled: boolean;
  label?: string;
};

export function SpoilerScore({
  children,
  className,
  enabled,
  label = "タップして結果を見る",
}: SpoilerScoreProps) {
  const [revealed, setRevealed] = useState(false);

  if (!enabled || revealed) {
    return <>{children}</>;
  }

  function reveal(event: MouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    setRevealed(true);
  }

  function revealWithKeyboard(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setRevealed(true);
  }

  return (
    <span
      aria-label={label}
      className={cn(
        "inline-flex cursor-pointer select-none items-center justify-center rounded-full border border-current/20 bg-current/5 px-3 py-1 text-center text-xs font-bold leading-tight",
        className,
      )}
      onClick={reveal}
      onKeyDown={revealWithKeyboard}
      role="button"
      tabIndex={0}
    >
      {label}
    </span>
  );
}
