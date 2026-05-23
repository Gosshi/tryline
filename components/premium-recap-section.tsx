"use client";

import { useEffect, useState } from "react";

import { MatchContentSection } from "@/components/match-content-section";

type Props = {
  content: React.ComponentProps<typeof MatchContentSection>["content"];
  language?: React.ComponentProps<typeof MatchContentSection>["language"];
  match: React.ComponentProps<typeof MatchContentSection>["match"];
};

export function PremiumRecapSection({ content, language, match }: Props) {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    fetch("/api/me/premium")
      .then((response) => response.json())
      .then((data: { isPremium?: boolean }) =>
        setIsPremium(data.isPremium ?? false),
      )
      .catch(() => undefined);
  }, []);

  return (
    <MatchContentSection
      content={content}
      contentType="recap"
      isPremium={isPremium}
      language={language}
      match={match}
    />
  );
}
