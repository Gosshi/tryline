import { Fragment } from "react";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

type MatchContentProps = {
  content: PublishedMatchContent;
  contentType: "preview" | "recap";
};

type InlineChunk =
  | { type: "text"; value: string }
  | { type: "link"; href: string; text: string };

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

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
        <h3 className="text-lg font-semibold" key={index}>
          {renderInline(block.text)}
        </h3>
      );
    }

    return (
      <h4 className="text-base font-semibold" key={index}>
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
    <p className="leading-7" key={index}>
      {renderInline(block.text)}
    </p>
  );
}

export function MatchContent({ content }: MatchContentProps) {
  const blocks = parseMarkdown(content.contentMdJa);

  return (
    <>
      <div className="space-y-4 text-slate-900">{blocks.map(renderBlock)}</div>
      <p className="mt-6 text-xs text-slate-500">
        <time dateTime={content.generatedAt}>
          {formatGeneratedAtJst(content.generatedAt)}
        </time>
      </p>
    </>
  );
}
