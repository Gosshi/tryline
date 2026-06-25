import { Fragment } from "react";

import { parseMarkdown } from "@/lib/match-content/markdown";

import type { MarkdownBlock } from "@/lib/match-content/markdown";

type CompetitionViewingGuideProps = {
  collapsible?: boolean;
  markdown: string | null;
};

type InlineChunk =
  | { type: "bold"; value: string }
  | { type: "link"; href: string; text: string }
  | { type: "text"; value: string };

function isSafeHref(href: string) {
  return href.startsWith("/") || /^https?:\/\//i.test(href);
}

function parseInline(text: string): InlineChunk[] {
  const chunks: InlineChunk[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      chunks.push({ type: "text", value: text.slice(cursor, index) });
    }

    if (match[3]) {
      chunks.push({ type: "bold", value: match[3] });
      cursor = index + match[0].length;
      continue;
    }

    const href = match[2] ?? "";
    const linkText = match[1] ?? "";
    chunks.push(
      isSafeHref(href)
        ? { href, text: linkText, type: "link" }
        : { type: "text", value: linkText },
    );
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    chunks.push({ type: "text", value: text.slice(cursor) });
  }

  return chunks;
}

function renderInline(text: string) {
  return parseInline(text).map((chunk, index) => {
    if (chunk.type === "bold") {
      return <strong key={`bold-${index}`}>{chunk.value}</strong>;
    }

    if (chunk.type === "link") {
      return (
        <a
          className="font-medium text-[var(--color-accent)] underline underline-offset-4"
          href={chunk.href}
          key={`${chunk.href}-${index}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {chunk.text}
        </a>
      );
    }

    return <Fragment key={`text-${index}`}>{chunk.value}</Fragment>;
  });
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    return (
      <h3
        className="font-heading text-lg font-bold text-[var(--color-ink)]"
        key={index}
      >
        {renderInline(block.text)}
      </h3>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="list-disc space-y-2 pl-5" key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "ordered-list") {
    return (
      <ol className="list-decimal space-y-2 pl-5" key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }

  if (block.type === "table") {
    const [header = [], ...rows] = block.rows;

    return (
      <div className="overflow-x-auto" key={index}>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {header.map((cell, cellIndex) => (
                <th
                  className="border-b border-slate-300 px-3 py-2 font-semibold"
                  key={`${index}-header-${cellIndex}`}
                >
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${index}-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    className="border-b border-slate-200 px-3 py-2"
                    key={`${index}-${rowIndex}-${cellIndex}`}
                  >
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <p className="leading-7 text-[var(--color-ink-muted)]" key={index}>
      {renderInline(block.text)}
    </p>
  );
}

export function CompetitionViewingGuide({
  collapsible = false,
  markdown,
}: CompetitionViewingGuideProps) {
  const content = markdown?.trim();

  if (!content) {
    return null;
  }

  const body = (
    <div className="space-y-4 text-sm sm:text-base">
      {parseMarkdown(content).map(renderBlock)}
    </div>
  );

  if (collapsible) {
    return (
      <details className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left marker:content-none">
          <span className="font-heading text-xl font-bold text-[var(--color-ink)] sm:text-2xl">
            大会ガイドを見る
          </span>
          <span
            aria-hidden
            className="text-lg font-bold text-[var(--color-ink-muted)] transition-transform group-open:rotate-45"
          >
            +
          </span>
        </summary>
        <section
          aria-labelledby="viewing-guide-heading"
          className="mt-5 space-y-4 border-t border-slate-200 pt-5"
        >
          <h2
            className="font-heading text-2xl font-bold text-[var(--color-ink)]"
            id="viewing-guide-heading"
          >
            大会ガイド
          </h2>
          {body}
        </section>
      </details>
    );
  }

  return (
    <section aria-labelledby="viewing-guide-heading" className="space-y-4">
      <h2
        className="font-heading text-2xl font-bold text-[var(--color-ink)]"
        id="viewing-guide-heading"
      >
        大会ガイド
      </h2>
      {body}
    </section>
  );
}
