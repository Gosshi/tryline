import ReactMarkdown from "react-markdown";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import remarkGfm from "remark-gfm";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

type MatchContentProps = {
  content: PublishedMatchContent;
  contentType: "preview" | "recap";
};

function formatGeneratedAtJst(generatedAt: string): string {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  });

  const parts = formatter.formatToParts(new Date(generatedAt));
  const indexedParts = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${indexedParts.year}-${indexedParts.month}-${indexedParts.day} ${indexedParts.hour}:${indexedParts.minute} JST 更新`;
}

export function MatchContent({ content }: MatchContentProps) {
  return (
    <>
      <div className="prose prose-slate prose-headings:mt-6 prose-headings:mb-3 prose-h1:text-lg prose-h1:font-semibold prose-h2:text-base prose-h2:font-semibold prose-h3:text-base prose-p:leading-7 max-w-none">
        <ReactMarkdown
          components={{
            h1: ({
              children,
              ...props
            }: { children?: ReactNode } & ComponentPropsWithoutRef<"h1">) => (
              <h3 className="text-lg font-semibold" {...props}>
                {children}
              </h3>
            ),
            h2: ({
              children,
              ...props
            }: { children?: ReactNode } & ComponentPropsWithoutRef<"h2">) => (
              <h4 className="text-base font-semibold" {...props}>
                {children}
              </h4>
            ),
          }}
          remarkPlugins={[remarkGfm]}
        >
          {content.contentMdJa}
        </ReactMarkdown>
      </div>
      <p className="mt-6 text-xs text-slate-500">
        <time dateTime={content.generatedAt}>
          {formatGeneratedAtJst(content.generatedAt)}
        </time>
      </p>
    </>
  );
}
