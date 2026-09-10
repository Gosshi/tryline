const JAPANESE_NAME_PATTERN = /^[\p{Script=Han}\p{Script=Hiragana}\s]+$/u;

/**
 * Formats Japanese player names for display without changing the source value.
 * Only names composed of kanji, hiragana, and whitespace are compacted so that
 * Latin and katakana name separators remain meaningful.
 */
export function formatPlayerNameDisplay(name: string | null): string | null {
  if (!name || !JAPANESE_NAME_PATTERN.test(name)) {
    return name;
  }

  return name.replace(/\s+/g, "");
}
