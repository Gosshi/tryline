import { ContentPlaceholder } from "@/components/content-placeholder";
import { MatchContent } from "@/components/match-content";
import { deriveContentState } from "@/lib/match-content/state";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";
import type { MatchDetail } from "@/lib/db/queries/matches";

type MatchContentSectionProps = {
  contentType: "preview" | "recap";
  content: PublishedMatchContent | null;
  isPremium: boolean;
  match: MatchDetail;
  showCta?: boolean;
};

const TITLES = {
  preview: "プレビュー",
  recap: "レビュー",
} as const;

export function MatchContentSection({
  content,
  contentType,
  isPremium,
  match,
  showCta,
}: MatchContentSectionProps) {
  const state = deriveContentState({
    contentType,
    kickoffAt: new Date(match.kickoffAt),
    matchStatus: match.status,
    now: new Date(),
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">
          {TITLES[contentType]}
        </h2>
      </div>

      {content ? (
        <MatchContent
          content={content}
          contentType={contentType}
          isPremium={isPremium}
          showCta={showCta}
        />
      ) : (
        <ContentPlaceholder state={state} type={contentType} />
      )}
    </section>
  );
}
