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
    // Recap output length varies with available match data; data-sparse
    // competitions stall around 1,200-1,400 chars no matter how often they
    // are regenerated, and pressuring the model toward a higher floor
    // invites padding and fabrication. A dense short recap beats an
    // inflated long one (Owner decision, 2026-06-12). The prompt still
    // asks for 2,000+ as the aspirational target.
    recap: { min: 1200, unit: "characters" },
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
