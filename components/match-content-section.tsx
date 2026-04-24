import { ContentPlaceholder } from "@/components/content-placeholder";
import { MatchContent } from "@/components/match-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deriveContentState } from "@/lib/match-content/state";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";
import type { MatchDetail } from "@/lib/db/queries/matches";

type MatchContentSectionProps = {
  contentType: "preview" | "recap";
  content: PublishedMatchContent | null;
  match: MatchDetail;
};

const TITLES = {
  preview: "プレビュー",
  recap: "レビュー",
} as const;

export function MatchContentSection({
  content,
  contentType,
  match,
}: MatchContentSectionProps) {
  const state = deriveContentState({
    contentType,
    kickoffAt: new Date(match.kickoffAt),
    matchStatus: match.status,
    now: new Date(),
  });

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{TITLES[contentType]}</CardTitle>
      </CardHeader>
      <CardContent>
        {content ? (
          <MatchContent content={content} contentType={contentType} />
        ) : (
          <ContentPlaceholder state={state} type={contentType} />
        )}
      </CardContent>
    </Card>
  );
}
