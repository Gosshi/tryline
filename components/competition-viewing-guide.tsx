import { Fragment } from "react";

import { parseMarkdown } from "@/lib/match-content/markdown";

import type { MarkdownBlock } from "@/lib/match-content/markdown";

type CompetitionViewingGuideProps = {
  markdown: string | null;
};

type InlineChunk =
  | { type: "link"; href: string; text: string }
  | { type: "text"; value: string };

function isSafeHref(href: string) {
  return href.startsWith("/") || /^https?:\/\//i.test(href);
}

function parseInline(text: string): InlineChunk[] {
  const chunks: InlineChunk[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      chunks.push({ type: "text", value: text.slice(cursor, index) });
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
  return parseInline(text).map((chunk, index) =>
    chunk.type === "link" ? (
      <a
        className="font-medium text-[var(--color-accent)] underline underline-offset-4"
        href={chunk.href}
        key={`${chunk.href}-${index}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {chunk.text}
      </a>
    ) : (
      <Fragment key={`text-${index}`}>{chunk.value}</Fragment>
    ),
  );
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
  markdown,
}: CompetitionViewingGuideProps) {
  const content = markdown?.trim();

  if (!content) {
    return null;
  }

  return (
    <section aria-labelledby="viewing-guide-heading" className="space-y-4">
      <h2
        className="font-heading text-2xl font-bold text-[var(--color-ink)]"
        id="viewing-guide-heading"
      >
        大会ガイド
      </h2>
      <div className="space-y-4 text-sm sm:text-base">
        {parseMarkdown(content).map(renderBlock)}
      </div>
    </section>
  );
}
