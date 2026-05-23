"use client";

import { useEffect, useState } from "react";

import { MatchChat } from "@/components/match-chat";

type Props = {
  matchId: string;
};

export function PremiumMatchChat({ matchId }: Props) {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    fetch("/api/me/premium")
      .then((response) => response.json())
      .then((data: { isPremium?: boolean }) =>
        setIsPremium(data.isPremium ?? false),
      )
      .catch(() => undefined);
  }, []);

  return <MatchChat isPremium={isPremium} matchId={matchId} />;
}
