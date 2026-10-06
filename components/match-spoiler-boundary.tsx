"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { useSpoilerGuard } from "@/components/spoiler-guard-toggle";

const MatchSpoilerContext = createContext<null | {
  revealed: boolean;
  reveal: () => void;
}>(null);

export function MatchSpoilerBoundary({
  children,
  finished,
}: {
  children: ReactNode;
  finished: boolean;
}) {
  const enabled = useSpoilerGuard();
  const [revealedFor, setRevealedFor] = useState<boolean | null>(null);
  // Reveals last only until the setting changes or this page is opened again.
  if (revealedFor !== null && revealedFor !== enabled) setRevealedFor(null);
  const revealed = revealedFor === true;
  return (
    <MatchSpoilerContext.Provider
      value={finished ? { revealed, reveal: () => setRevealedFor(true) } : null}
    >
      <div
        data-match-spoiler={finished ? "finished" : undefined}
        data-match-revealed={revealed ? "true" : undefined}
      >
        {children}
      </div>
    </MatchSpoilerContext.Provider>
  );
}

export function useMatchSpoiler() {
  return useContext(MatchSpoilerContext);
}
