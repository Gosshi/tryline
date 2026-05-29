import { truncateAtSentenceBoundary } from "@/lib/text";

const MAX_DESCRIPTION_LENGTH = 120;

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^(#{1,6})\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/^[-+*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractDescription(markdown: string): string {
  const plainText = stripMarkdown(markdown);

  if (plainText.length <= MAX_DESCRIPTION_LENGTH) {
    return plainText;
  }

  return truncateAtSentenceBoundary(plainText, MAX_DESCRIPTION_LENGTH);
}

export function extractCoreSection(markdown: string): string {
  const heading = /^#\s*この試合の核心[^\n]*$/m.exec(markdown);

  if (!heading) {
    return extractDescription(markdown);
  }

  const contentStart = heading.index + heading[0].length;
  const contentAfterHeading = markdown.slice(contentStart).replace(/^\n+/, "");
  const nextHeadingIndex = contentAfterHeading.search(/^#[^#][^\n]*$/m);
  const section =
    nextHeadingIndex === -1
      ? contentAfterHeading
      : contentAfterHeading.slice(0, nextHeadingIndex);
  const plainText = stripMarkdown(section.trim());

  if (plainText.length <= MAX_DESCRIPTION_LENGTH) {
    return plainText;
  }

  return truncateAtSentenceBoundary(plainText, MAX_DESCRIPTION_LENGTH);
}