import { Fragment } from "react";

import { parseMarkdown } from "@/lib/match-content/markdown";

import type { MarkdownBlock } from "@/lib/match-content/markdown";

type CompetitionViewingGuideProps = {
  broadcastServices?: Array<{
    serviceName: string;
    url: string;
  }>;
  markdown: string | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
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

const BROADCAST_INFORMATION_PATTERN =
  /(DAZN|WOWOW|J\s*SPORTS|JSPORTS|NHK|放送|配信|中継|視聴|独占|全試合)/i;

function isMarkdownHeading(block: string) {
  return /^#{1,6}\s+/.test(block.trim());
}

function removeUnverifiedBroadcastBlocks(markdown: string) {
  const blocks = markdown.split(/\n{2,}/);
  const filteredBlocks: string[] = [];
  let removed = false;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] ?? "";

    if (
      isMarkdownHeading(block) &&
      BROADCAST_INFORMATION_PATTERN.test(block)
    ) {
      removed = true;
      while (
        index + 1 < blocks.length &&
        !isMarkdownHeading(blocks[index + 1] ?? "")
      ) {
        index += 1;
      }
      continue;
    }

    if (BROADCAST_INFORMATION_PATTERN.test(block)) {
      removed = true;
      const previous = filteredBlocks.at(-1);
      if (previous && isMarkdownHeading(previous)) {
        filteredBlocks.pop();
      }
      continue;
    }

    filteredBlocks.push(block);
  }

  return {
    content: filteredBlocks.join("\n\n").trim(),
    removed,
  };
}

function formatVerifiedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  })
    .format(date)
    .replaceAll("/", "-");
}

export function CompetitionViewingGuide({
  broadcastServices = [],
  markdown,
  sourceUrl,
  verifiedAt,
}: CompetitionViewingGuideProps) {
  const rawContent = markdown?.trim();

  if (!rawContent && broadcastServices.length === 0) {
    return null;
  }

  const normalized = rawContent
    ? verifiedAt
      ? { content: rawContent, removed: false }
      : removeUnverifiedBroadcastBlocks(rawContent)
    : { content: "", removed: false };

  if (
    !normalized.content &&
    !normalized.removed &&
    broadcastServices.length === 0
  ) {
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
      {verifiedAt && (
        <p className="text-xs font-medium text-[var(--color-ink-muted)]">
          最終確認日: {formatVerifiedDate(verifiedAt)}
          {sourceUrl && (
            <>
              {" "}
              <a
                className="text-[var(--color-accent)] underline underline-offset-4"
                href={sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                参照元
              </a>
            </>
          )}
        </p>
      )}
      {broadcastServices.length > 0 ? (
        <section
          aria-labelledby="broadcast-services-heading"
          className="rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <h3
            className="font-heading text-lg font-bold text-[var(--color-ink)]"
            id="broadcast-services-heading"
          >
            日本での視聴方法
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            放送・配信サービス
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {broadcastServices.map((service) => (
              <a
                className="rounded-full border border-[var(--color-accent)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                href={service.url}
                key={service.serviceName}
                rel="noopener noreferrer"
                target="_blank"
              >
                {service.serviceName}
              </a>
            ))}
          </div>
        </section>
      ) : normalized.removed ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          放送・配信情報は確認中です。最新の視聴方法は各配信サービスの公式案内を確認してください。
        </p>
      ) : null}
      {normalized.content && (
        <div className="space-y-4 text-sm sm:text-base">
          {parseMarkdown(normalized.content).map(renderBlock)}
        </div>
      )}
    </section>
  );
}
