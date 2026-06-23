"use client";

import { useEffect, useState } from "react";

import { MatchContentSection } from "@/components/match-content-section";

type Props = {
  afterBody?: React.ComponentProps<typeof MatchContentSection>["afterBody"];
  betweenLeadAndBody?: React.ComponentProps<
    typeof MatchContentSection
  >["betweenLeadAndBody"];
  content: React.ComponentProps<typeof MatchContentSection>["content"];
  hasLockedContent: boolean;
  language?: React.ComponentProps<typeof MatchContentSection>["language"];
  match: React.ComponentProps<typeof MatchContentSection>["match"];
  nextLockedHeading: string | null;
};

export function PremiumRecapSection({
  afterBody,
  betweenLeadAndBody,
  content,
  hasLockedContent,
  language = "ja",
  match,
  nextLockedHeading,
}: Props) {
  const [state, setState] = useState<{
    isPremium: boolean;
    loaded: boolean;
    lockedMd: string | null;
  }>({
    isPremium: false,
    loaded: !hasLockedContent,
    lockedMd: null,
  });

  useEffect(() => {
    if (!hasLockedContent) {
      setState({ isPremium: false, loaded: true, lockedMd: null });
      return;
    }

    setState({ isPremium: false, loaded: false, lockedMd: null });

    const params = new URLSearchParams({ lang: language });
    fetch(`/api/matches/${match.id}/recap-locked?${params.toString()}`)
      .then((response) => response.json())
      .then((data: { isPremium?: boolean; lockedMd?: string | null }) =>
        setState({
          isPremium: data.isPremium === true && Boolean(data.lockedMd),
          loaded: true,
          lockedMd: data.lockedMd ?? null,
        }),
      )
      .catch(() =>
        setState({ isPremium: false, loaded: true, lockedMd: null }),
      );
  }, [hasLockedContent, language, match.id]);

  return (
    <MatchContentSection
      afterBody={afterBody}
      betweenLeadAndBody={betweenLeadAndBody}
      content={content}
      contentType="recap"
      hasLockedContent={hasLockedContent}
      isPremium={state.isPremium}
      language={language}
      lockedContentMd={state.lockedMd}
      lockedLoading={hasLockedContent && !state.loaded}
      match={match}
      nextLockedHeading={nextLockedHeading}
    />
  );
}
