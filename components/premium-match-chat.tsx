"use client";

import { useEffect, useState } from "react";

import { MatchChat } from "@/components/match-chat";

type Props = {
  matchId: string;
};

export function PremiumMatchChat({ matchId }: Props) {
  const [isPremium, setIsPremium] = useState(false);
  const [hasFreeQuestion, setHasFreeQuestion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/me/premium")
        .then((response) => response.json())
        .catch(() => ({})),
      fetch(`/api/me/chat-free/${matchId}`)
        .then((response) => response.json())
        .catch(() => ({})),
    ]).then(
      ([
        premiumData,
        freeQuestionData,
      ]: [
        { isPremium?: boolean },
        { hasFreeQuestion?: boolean },
      ]) => {
        if (cancelled) {
          return;
        }

        setIsPremium(premiumData.isPremium ?? false);
        setHasFreeQuestion(freeQuestionData.hasFreeQuestion ?? false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  return (
    <MatchChat
      hasFreeQuestion={hasFreeQuestion}
      isPremium={isPremium}
      matchId={matchId}
    />
  );
}
