export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

export type RecapPaywallSplit = {
  freeMd: string;
  hasLocked: boolean;
  lockedMd: string | null;
  nextHeadingText: string | null;
};

export function parseMarkdown(markdown: string): MarkdownBlock[] {
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

function getHeadingText(line: string) {
  return line.replace(/^#{1,6}\s*/, "").trim();
}

export function splitRecapForPaywall(markdown: string): RecapPaywallSplit {
  const lines = markdown.split(/\r?\n/);
  const headingLines = lines
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      return match
        ? {
            index,
            level: match[1]!.length,
            text: getHeadingText(line),
          }
        : null;
    })
    .filter(
      (
        item,
      ): item is {
        index: number;
        level: number;
        text: string;
      } => item !== null,
    );
  const h1Count = headingLines.filter((heading) => heading.level === 1).length;
  const sectionLevel = h1Count > 1 ? 1 : 2;
  const sectionHeadings = headingLines.filter(
    (heading) => heading.level === sectionLevel,
  );
  const lockedStart = sectionHeadings[2];

  if (!lockedStart) {
    return {
      freeMd: markdown,
      hasLocked: false,
      lockedMd: null,
      nextHeadingText: null,
    };
  }

  const freeMd = lines.slice(0, lockedStart.index).join("\n").trim();
  const lockedMd = lines.slice(lockedStart.index).join("\n").trim();

  return {
    freeMd,
    hasLocked: lockedMd.length > 0,
    lockedMd: lockedMd.length > 0 ? lockedMd : null,
    nextHeadingText: lockedMd.length > 0 ? lockedStart.text : null,
  };
}
