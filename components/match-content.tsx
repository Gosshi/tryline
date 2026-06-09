import { Fragment } from "react";

import { NoteIcon } from "@/components/icons/note-icon";
import { XIcon } from "@/components/icons/x-icon";
import { TrackedLink } from "@/components/tracked-link";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

type MatchContentProps = {
  content: PublishedMatchContent;
  contentType: "preview" | "recap";
  isPremium: boolean;
  language?: "ja" | "en";
  matchTitle?: string;
  showCta?: boolean;
};

type InlineChunk =
  | { type: "text"; value: string }
  | { type: "link"; href: string; text: string };

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

function formatGeneratedAt(generatedAt: string, language: "ja" | "en"): string {
  const formatter = new Intl.DateTimeFormat(
    language === "en" ? "en-US" : "ja-JP",
    {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Tokyo",
      year: "numeric",
    },
  );

  const parts = formatter.formatToParts(new Date(generatedAt));
  const indexedParts = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  const timestamp = `${indexedParts.year}-${indexedParts.month}-${indexedParts.day} ${indexedParts.hour}:${indexedParts.minute} JST`;

  return language === "en" ? `Updated ${timestamp}` : `${timestamp} 更新`;
}

function toHeadingId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w぀-ヿ一-鿿-]/g, "")
    .slice(0, 60);
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

    const [, linkText = "", href = "#"] = match;
    chunks.push({ href, text: linkText, type: "link" });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    chunks.push({ type: "text", value: text.slice(cursor) });
  }

  return chunks.map((chunk) =>
    chunk.type === "text"
      ? {
          ...chunk,
          value: chunk.value.replace(/[*_~`]/g, ""),
        }
      : chunk,
  );
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";

    if (!line) {
      continue;
    }

    if (line.startsWith("#")) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      blocks.push({ level, text: line.replace(/^#+\s*/, ""), type: "heading" });
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [line.slice(2)];

      while ((lines[i + 1] ?? "").trim().startsWith("- ")) {
        i += 1;
        items.push((lines[i] ?? "").trim().slice(2));
      }

      blocks.push({ items, type: "list" });
      continue;
    }

    if (line.startsWith("|") && (lines[i + 1] ?? "").trim().startsWith("|")) {
      const header = line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      const rows: string[][] = [header];

      i += 1;

      while ((lines[i + 1] ?? "").trim().startsWith("|")) {
        i += 1;
        const row = (lines[i] ?? "")
          .trim()
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean);

        if (row.every((cell) => /^:?-{3,}:?$/.test(cell))) {
          continue;
        }

        rows.push(row);
      }

      blocks.push({ rows, type: "table" });
      continue;
    }

    const paragraphLines = [line];

    while (
      lines[i + 1] &&
      (lines[i + 1] ?? "").trim() &&
      !(lines[i + 1] ?? "").trim().startsWith("#") &&
      !(lines[i + 1] ?? "").trim().startsWith("- ") &&
      !(lines[i + 1] ?? "").trim().startsWith("|")
    ) {
      i += 1;
      paragraphLines.push((lines[i] ?? "").trim());
    }

    blocks.push({ text: paragraphLines.join(" "), type: "paragraph" });
  }

  return blocks;
}

function splitAtSecondHeading(blocks: MarkdownBlock[]): {
  free: MarkdownBlock[];
  locked: MarkdownBlock[];
} {
  let h1Count = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block?.type === "heading" && block.level === 1) {
      h1Count += 1;

      if (h1Count === 2) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }

  let h2Count = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block?.type === "heading" && block.level === 2) {
      h2Count += 1;

      if (h2Count === 2) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }

  return { free: blocks, locked: [] };
}

export function splitRecapAtThirdHeading(blocks: MarkdownBlock[]): {
  free: MarkdownBlock[];
  locked: MarkdownBlock[];
} {
  let h1Count = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block?.type === "heading" && block.level === 1) {
      h1Count += 1;

      if (h1Count === 3) {
        return { free: blocks.slice(0, i), locked: blocks.slice(i) };
      }
    }
  }

  return { free: blocks, locked: [] };
}

function renderInline(text: string) {
  return parseInline(text).map((chunk, index) => {
    if (chunk.type === "text") {
      return <Fragment key={`text-${index}`}>{chunk.value}</Fragment>;
    }

    return (
      <a
        className="text-blue-700 underline"
        href={chunk.href}
        key={`link-${index}`}
        rel="noreferrer noopener"
        target="_blank"
      >
        {chunk.text}
      </a>
    );
  });
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    if (block.level <= 1) {
      return (
        <h3
          className="scroll-mt-6 border-l-2 border-[var(--color-accent)] pl-3 font-serif text-lg font-bold text-[var(--color-ink)]"
          id={toHeadingId(block.text)}
          key={index}
        >
          {renderInline(block.text)}
        </h3>
      );
    }

    return (
      <h4
        className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]"
        key={index}
      >
        {renderInline(block.text)}
      </h4>
    );
  }

  if (block.type === "list") {
    return (
      <ul className="list-disc space-y-1 pl-6" key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }

  if (block.type === "table") {
    const [header = [], ...body] = block.rows;

    return (
      <div className="overflow-x-auto" key={index}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {header.map((cell, cellIndex) => (
                <th
                  className="border px-2 py-1 text-left"
                  key={`${index}-h-${cellIndex}`}
                >
                  {renderInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={`${index}-r-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    className="border px-2 py-1"
                    key={`${index}-c-${rowIndex}-${cellIndex}`}
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
    <p className="leading-[1.9] text-[var(--color-ink)]" key={index}>
      {renderInline(block.text)}
    </p>
  );
}

function XFollowCta() {
  return (
    <div className="mt-8 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        週末の注目試合と無料サンプルは X / note で更新中
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          className="flex w-fit items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href="https://x.com/tryline_rugbyjp"
          rel="noopener noreferrer"
          target="_blank"
        >
          <XIcon className="h-3.5 w-3.5" />
          フォローする
        </a>
        <a
          aria-label="note @tryline_rugbyjp"
          className="flex w-fit items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          href="https://note.com/tryline_rugbyjp"
          rel="noopener noreferrer"
          target="_blank"
        >
          <NoteIcon className="h-3.5 w-10" />
          note
        </a>
      </div>
    </div>
  );
}

export function MatchContent({
  content,
  contentType,
  isPremium,
  language = "ja",
  matchTitle,
  showCta = true,
}: MatchContentProps) {
  const isLocked = !isPremium;
  const allBlocks = parseMarkdown(content.contentMdJa);
  const { free: freeBlocks, locked: lockedBlocks } = isLocked
    ? contentType === "recap"
      ? splitRecapAtThirdHeading(allBlocks)
      : splitAtSecondHeading(allBlocks)
    : { free: allBlocks, locked: [] };
  const blocks = isLocked ? freeBlocks : allBlocks;
  const nextHeading = isLocked
    ? (lockedBlocks.find(
        (block): block is Extract<MarkdownBlock, { type: "heading" }> =>
          block.type === "heading",
      ) ?? undefined)
    : undefined;
  const hasLockedBlocks = isLocked && lockedBlocks.length > 0;
  const headings = blocks.filter(
    (block): block is Extract<MarkdownBlock, { type: "heading" }> =>
      block.type === "heading" && block.level <= 1,
  );

  return (
    <>
      {isPremium && headings.length >= 2 && (
        <nav
          aria-label="目次"
          className="mb-6 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            {language === "en" ? "Contents" : "目次"}
          </p>
          <ol className="space-y-1">
            {headings.map((heading, index) => (
              <li key={`${toHeadingId(heading.text)}-${index}`}>
                <a
                  className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:underline"
                  href={`#${toHeadingId(heading.text)}`}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="relative space-y-5 text-[var(--color-ink)]">
        {blocks.map(renderBlock)}
        {nextHeading && (
          <p className="relative z-10 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            {language === "en" ? "Next section" : "次のセクション"}
            <span className="ml-2 normal-case text-[var(--color-ink-muted)]">
              {nextHeading.text} →
            </span>
          </p>
        )}
        {hasLockedBlocks && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {hasLockedBlocks && showCta && (
        <div className="mt-4 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {language === "en"
              ? matchTitle
                ? `Read the full ${matchTitle} analysis with Premium`
                : "The full article is available with Premium"
              : matchTitle
                ? `${matchTitle} の勝負どころを最後まで読む`
                : "続きは Premium でご覧いただけます"}
          </p>
          <TrackedLink
            analytics={{
              content_type: contentType,
              cta_id: "match_content_locked_pricing",
              cta_location: "match_content_locked_blocks",
              destination: "pricing",
              label:
                language === "en"
                  ? "Read with Premium"
                  : matchTitle
                    ? "7日間無料でレビュー全文を読む"
                    : "Premium で全文を読む",
              language,
            }}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            href="/pricing"
          >
            {language === "en"
              ? "Read with Premium"
              : matchTitle
                ? "7日間無料でレビュー全文を読む"
                : "Premium で全文を読む"}
          </TrackedLink>
        </div>
      )}
      <XFollowCta />
      <p className="mt-6 text-xs text-slate-500">
        <time dateTime={content.generatedAt}>
          {formatGeneratedAt(content.generatedAt, language)}
        </time>
      </p>
    </>
  );
}
