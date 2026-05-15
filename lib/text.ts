const SENTENCE_ENDINGS = ["。", "！", "？", ".", "!", "?"] as const;

export function truncateAtSentenceBoundary(
  text: string,
  maxLength = 120,
): string {
  if (text.length <= maxLength) {
    return text;
  }

  const candidate = text.slice(0, maxLength);
  const lastSentenceEnd = Math.max(
    ...SENTENCE_ENDINGS.map((ending) => candidate.lastIndexOf(ending)),
  );

  if (lastSentenceEnd > maxLength * 0.5) {
    return text.slice(0, lastSentenceEnd + 1);
  }

  return `${candidate}…`;
}
