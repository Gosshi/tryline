export type ParsedResearchSource = {
  sourceUrl: string;
  facts: Array<{ fact: string; lineNumber: number }>;
};

export type ParsedResearchPaste = {
  sources: ParsedResearchSource[];
  skippedLines: Array<{
    lineNumber: number;
    reason: "outside_source" | "note" | "too_long";
  }>;
};

const MAX_FACT_LENGTH = 300;
const TRACKING_PARAMETERS = ["utm_source", "utm_medium", "utm_campaign"];

function extractSourceUrl(line: string) {
  const markdownLink = line.match(/\]\(([^)\s]+)\)/u);
  const rawUrl =
    markdownLink?.[1] ?? line.match(/https?:\/\/\S+/u)?.[0] ?? null;
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    for (const parameter of TRACKING_PARAMETERS) {
      url.searchParams.delete(parameter);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function parseResearchPaste(text: string): ParsedResearchPaste {
  const sources: ParsedResearchSource[] = [];
  const skippedLines: ParsedResearchPaste["skippedLines"] = [];
  let activeSource: ParsedResearchSource | null = null;

  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const lineNumber = index + 1;
    const trimmedLine = rawLine.trim();
    if (trimmedLine.startsWith("### 出典:")) {
      const sourceUrl = extractSourceUrl(trimmedLine);
      activeSource = sourceUrl ? { sourceUrl, facts: [] } : null;
      if (activeSource) {
        sources.push(activeSource);
      }
      continue;
    }
    if (trimmedLine.startsWith("## ")) {
      activeSource = null;
      continue;
    }
    if (!trimmedLine.startsWith("- ")) {
      continue;
    }
    if (!activeSource) {
      skippedLines.push({ lineNumber, reason: "outside_source" });
      continue;
    }
    if (trimmedLine.startsWith("- **")) {
      skippedLines.push({ lineNumber, reason: "note" });
      continue;
    }

    const fact = trimmedLine
      .slice(2)
      .replace(/(?:\s*:chatgpt-content-reference\{[^}]*\}\s*)+$/gu, "")
      .trim();
    if ([...fact].length > MAX_FACT_LENGTH) {
      skippedLines.push({ lineNumber, reason: "too_long" });
      continue;
    }
    if (fact) {
      activeSource.facts.push({ fact, lineNumber });
    }
  }

  return { sources, skippedLines };
}
