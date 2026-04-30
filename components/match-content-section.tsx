import { ContentPlaceholder } from "@/components/content-placeholder";
import { MatchContent } from "@/components/match-content";
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

const SUBTITLES = {
  preview: "Match Preview",
  recap: "Match Review",
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
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {SUBTITLES[contentType]}
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
          {TITLES[contentType]}
        </h2>
      </div>

      {content ? (
        <MatchContent content={content} contentType={contentType} />
      ) : (
        <ContentPlaceholder state={state} type={contentType} />
      )}
    </section>
  );
}
