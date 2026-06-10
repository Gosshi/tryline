"use client";

import { useEffect, useState } from "react";

import { MatchChat } from "@/components/match-chat";

type Props = {
  matchId: string;
};

export function PremiumMatchChat({ matchId }: Props) {
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [hasFreeQuestion, setHasFreeQuestion] = useState<boolean | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/me/premium")
        .then((response) => response.json())
        .catch(() => ({})),
      fetch(`/api/me/chat-free/${matchId}`)
        .then((response) => response.json())
        .catch(() => ({
          hasFreeQuestion: null as boolean | null,
          isLoggedIn: null as boolean | null,
        })),
    ]).then(
      ([
        premiumData,
        freeQuestionData,
      ]: [
        { isPremium?: boolean },
        { hasFreeQuestion?: boolean | null; isLoggedIn?: boolean | null },
      ]) => {
        if (cancelled) {
          return;
        }

        setIsPremium(premiumData.isPremium ?? false);
        setHasFreeQuestion(freeQuestionData.hasFreeQuestion ?? null);
        setIsLoggedIn(freeQuestionData.isLoggedIn ?? null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  return (
    <MatchChat
      hasFreeQuestion={hasFreeQuestion}
      isLoggedIn={isLoggedIn}
      isPremium={isPremium}
      matchId={matchId}
    />
  );
}
