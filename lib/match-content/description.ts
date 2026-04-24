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

  return `${plainText.slice(0, MAX_DESCRIPTION_LENGTH)}…`;
}
