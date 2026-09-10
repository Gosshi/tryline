import { ContentPlaceholder } from "@/components/content-placeholder";
import { MatchContent } from "@/components/match-content";
import { parseMarkdown } from "@/lib/match-content/markdown";
import { deriveContentState } from "@/lib/match-content/state";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";
import type { MatchDetail } from "@/lib/db/queries/matches";
import type { ReactNode } from "react";

type MatchContentSectionProps = {
  contentType: "preview" | "recap";
  content: PublishedMatchContent | null;
  afterBody?: ReactNode;
  betweenLeadAndBody?: ReactNode;
  hasLockedContent?: boolean;
  isPremium: boolean;
  isSample?: boolean;
  language?: "ja" | "en";
  lockedContentMd?: string | null;
  lockedLoading?: boolean;
  match: MatchDetail;
  nextLockedHeading?: string | null;
  showCta?: boolean;
};

function getReadableText(blocks: ReturnType<typeof parseMarkdown>): string {
  const text = blocks
    .flatMap((block) => {
      if (block.type === "list" || block.type === "ordered-list") {
        return block.items;
      }

      if (block.type === "table") {
        return block.rows.flat();
      }

      return [block.text];
    })
    .join(" ");

  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_~`]/g, "")
    .trim();
}

function getReadingMinutes(text: string, language: "ja" | "en"): number {
  return language === "en"
    ? Math.max(1, Math.ceil(text.split(/\s+/).length / 220))
    : Math.max(1, Math.ceil(text.length / 500));
}

const TITLES = {
  en: {
    preview: "Preview",
    recap: "Review",
  },
  ja: {
    preview: "プレビュー",
    recap: "レビュー",
  },
} as const;

export function MatchContentSection({
  afterBody,
  betweenLeadAndBody,
  content,
  contentType,
  hasLockedContent,
  isPremium,
  isSample = false,
  language = "ja",
  lockedContentMd,
  lockedLoading,
  match,
  nextLockedHeading,
  showCta,
}: MatchContentSectionProps) {
  const state = deriveContentState({
    contentType,
    kickoffAt: new Date(match.kickoffAt),
    matchStatus: match.status,
    now: new Date(),
  });
  const matchTitle =
    language === "en"
      ? `${match.homeTeam.englishName ?? match.homeTeam.name} vs ${match.awayTeam.englishName ?? match.awayTeam.name}`
      : `${match.homeTeam.name} 対 ${match.awayTeam.name}`;
  const blocks = content ? parseMarkdown(content.contentMdJa) : [];
  const contentHeading = blocks.find((block) => block.type === "heading");
  const lead = blocks.find((block) => block.type === "paragraph");
  const includesLockedContent =
    hasLockedContent === true && isPremium && Boolean(lockedContentMd);
  const readingBlocks = includesLockedContent
    ? [...blocks, ...parseMarkdown(lockedContentMd ?? "")]
    : blocks;
  const readingMinutes = content
    ? getReadingMinutes(getReadableText(readingBlocks), language)
    : null;
  const isFreeSectionReadingTime =
    hasLockedContent === true && !includesLockedContent;
  const sectionTitle = contentHeading?.text ?? TITLES[language][contentType];

  return (
    <>
      <section className="rounded-[var(--radius-md)] bg-white px-5 py-6 shadow-[var(--shadow-soft)] sm:px-7 sm:py-7">
        <h2 className="text-[clamp(1.35rem,4vw,1.75rem)] font-black leading-[1.5] text-[var(--color-ink)]">
          {sectionTitle}
        </h2>
        {lead?.type === "paragraph" && (
          <p className="mt-4 text-[15px] font-medium leading-[1.95] text-[#434b59]">
            {lead.text}
          </p>
        )}
        {content ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--color-rule)] pt-4 text-xs text-[var(--color-ink-muted)]">
            <span className="font-bold text-[var(--color-ink)]">
              Tryline 編集部
            </span>
            <span aria-hidden>・</span>
            <span>
              {isFreeSectionReadingTime
                ? language === "en"
                  ? `About ${readingMinutes} min for the free section`
                  : `無料部分で約${readingMinutes}分`
                : language === "en"
                  ? `About ${readingMinutes} min read`
                  : `約${readingMinutes}分`}
            </span>
            <span className="ml-auto rounded-full bg-[var(--color-accent-subtle)] px-3 py-1 font-bold text-[var(--color-accent)]">
              {TITLES[language][contentType]}
            </span>
          </div>
        ) : (
          <div className="mt-5 border-t border-[var(--color-rule)] pt-5">
            <ContentPlaceholder state={state} type={contentType} />
          </div>
        )}
      </section>

      {content && betweenLeadAndBody}

      {content && (
        <section className="rounded-[var(--radius-md)] bg-white px-5 py-6 shadow-[var(--shadow-soft)] sm:px-7 sm:py-7">
          <h2 className="sr-only">{TITLES[language][contentType]}本文</h2>
          <MatchContent
            content={content}
            contentType={contentType}
            hasLockedContent={hasLockedContent}
            hideLead
            isPremium={isPremium}
            isSample={isSample}
            language={language}
            lockedContentMd={lockedContentMd}
            lockedLoading={lockedLoading}
            matchId={match.id}
            matchTitle={matchTitle}
            nextLockedHeading={nextLockedHeading}
            showCta={showCta}
          />
          {afterBody}
        </section>
      )}
    </>
  );
}
