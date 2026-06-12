import type { ContentLanguage, ContentType } from "@/lib/llm/types";

export const CONTENT_LENGTH_ISSUE = "本文が目標字数の下限未満です";

export type ContentLengthRequirement = {
  min: number;
  unit: "characters" | "words";
};

const CONTENT_LENGTH_REQUIREMENTS: Record<
  ContentLanguage,
  Record<ContentType, ContentLengthRequirement>
> = {
  en: {
    preview: { min: 550, unit: "words" },
    recap: { min: 600, unit: "words" },
  },
  ja: {
    preview: { min: 1500, unit: "characters" },
    // GPT-4o reliably produces ~1,500-1,650 chars for recaps even when the
    // prompt budgets sum well past 2,000; the prompt keeps asking for 2,000+
    // as an aspirational target, while this enforced minimum matches what
    // the model actually delivers (Owner decision, 2026-06-12).
    recap: { min: 1500, unit: "characters" },
  },
};

export function getContentLengthRequirement(
  contentType: ContentType,
  language: ContentLanguage,
): ContentLengthRequirement {
  return CONTENT_LENGTH_REQUIREMENTS[language][contentType];
}

export function measureContentLength(
  content: string,
  requirement: ContentLengthRequirement,
): number {
  if (requirement.unit === "words") {
    return content.trim().split(/\s+/).filter(Boolean).length;
  }

  return Array.from(content).length;
}
