import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import {
  getCurrentJstWeekRangeUtc,
  getJstWeekRangeUtc,
} from "@/lib/format/week";
import { MODELS } from "@/lib/llm/models";
import { createWebSearchJsonResponse } from "@/lib/llm/openai";
import {
  isAllowedSourcedFactDomain,
  normalizeSourcedFactDomain,
} from "@/lib/llm/sourced-facts/allowlist";

import type { Json } from "@/lib/db/types";
import type { SourcedFactConfidence } from "@/lib/llm/sourced-facts/types";

export const WEEKLY_NEWS_PROMPT_VERSION = "weekly-news@1.0.0";

const WEEKLY_NEWS_CATEGORIES = [
  "transfer",
  "quote",
  "competition",
  "injury",
  "other",
] as const;

export type WeeklyNewsCategory = (typeof WEEKLY_NEWS_CATEGORIES)[number];

export type StoredWeeklyNewsItem = {
  category: WeeklyNewsCategory;
  confidence: SourcedFactConfidence;
  fetched_at: string;
  model_version: string;
  source_domain: string;
  source_url: string;
  status: "draft";
  summary_ja: string;
  title_ja: string;
  week_from: string;
  week_to: string;
};

type ParsedWeeklyNewsResponse = {
  items?: Array<{
    category?: unknown;
    confidence?: unknown;
    published_at?: unknown;
    source_url?: unknown;
    summary_ja?: unknown;
    title_ja?: unknown;
  }>;
};

type ParsedWeeklyNewsItem = Omit<StoredWeeklyNewsItem, "fetched_at" | "model_version" | "status" | "week_from" | "week_to"> & {
  published_at: string | null;
};

export type FetchWeeklyNewsResult = {
  fetched: boolean;
  items: StoredWeeklyNewsItem[];
  week: { from: string; to: string };
};

function normalizeCategory(value: unknown): WeeklyNewsCategory {
  return typeof value === "string" &&
    (WEEKLY_NEWS_CATEGORIES as readonly string[]).includes(value)
    ? (value as WeeklyNewsCategory)
    : "other";
}

function normalizeConfidence(value: unknown): SourcedFactConfidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizePublishedAt(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return null;
  }

  return new Date(value).toISOString();
}

function extractJsonObjectText(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  return firstBrace === -1 || lastBrace <= firstBrace
    ? null
    : candidate.slice(firstBrace, lastBrace + 1);
}

export function buildWeeklyNewsSearchPrompt(weekFrom: string, weekTo: string) {
  return [
    "Find reliable rugby news for Tryline's weekly shared news feed using web search.",
    `week: ${weekFrom} through ${weekTo} (JST)`,
    [
      "Search intent:",
      "- player transfers and contract news",
      "- player or coach comments",
      "- competition news and tournament developments",
      "- injuries that materially affect upcoming rugby",
      "- cover Six Nations, Premiership, URC, Top 14, Super Rugby Pacific, and Rugby World Cup / Nations Championship",
      `- only include news published within the target week (${weekFrom} through ${weekTo}, JST); exclude older news even if it remains relevant`,
    ].join("\n"),
    [
      "Rules:",
      "- Return only facts supported by the linked source. Do not invent or infer details.",
      "- Include source_url for every item.",
      "- Do not include quotes longer than 15 words. Paraphrase facts in Japanese.",
      "- Do not reproduce article text or copyrighted prose.",
      "- title_ja and summary_ja must be Japanese paraphrases, not translations of article passages.",
      "- category must be transfer, quote, competition, injury, or other.",
      "- confidence must be high, medium, or low.",
    ].join("\n"),
    'Return JSON only: {"items":[{"category":"transfer|quote|competition|injury|other","title_ja":"...","summary_ja":"...","source_url":"https://...","published_at":"ISO 8601 or null","confidence":"high|medium|low"}]}',
  ].join("\n\n");
}

export function parseWeeklyNewsResponse(
  text: string,
  weekFrom: string,
  now = new Date(),
): ParsedWeeklyNewsItem[] {
  const jsonText = extractJsonObjectText(text);
  const weekStartUtc = new Date(
    getJstWeekRangeUtc(weekFrom, now).startUtcIso,
  ).getTime();

  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText) as ParsedWeeklyNewsResponse;

    return (Array.isArray(parsed.items) ? parsed.items : []).flatMap((item) => {
      const title = normalizeText(item.title_ja);
      const summary = normalizeText(item.summary_ja);
      const sourceUrl = normalizeText(item.source_url);
      const sourceDomain = sourceUrl
        ? normalizeSourcedFactDomain(sourceUrl)
        : null;
      const publishedAt = normalizePublishedAt(item.published_at);

      if (
        !title ||
        !summary ||
        !sourceUrl ||
        !sourceDomain ||
        !publishedAt ||
        new Date(publishedAt).getTime() < weekStartUtc ||
        !isAllowedSourcedFactDomain(sourceDomain)
      ) {
        return [];
      }

      return [{
        category: normalizeCategory(item.category),
        confidence: normalizeConfidence(item.confidence),
        published_at: publishedAt,
        source_domain: sourceDomain,
        source_url: sourceUrl,
        summary_ja: summary,
        title_ja: title,
      }];
    });
  } catch {
    return [];
  }
}

function metadataForWeeklyNews(prompt: string): Json {
  return {
    prompt_hash: createHash("sha256").update(prompt).digest("hex"),
    prompt_version: WEEKLY_NEWS_PROMPT_VERSION,
  };
}

export async function fetchWeeklyNews(options?: {
  now?: Date;
  weekFrom?: string;
}): Promise<FetchWeeklyNewsResult> {
  const now = options?.now ?? new Date();
  const week = options?.weekFrom
    ? getJstWeekRangeUtc(options.weekFrom, now)
    : getCurrentJstWeekRangeUtc(now);
  const weekFrom = week.weekStartJst;
  const weekTo = week.weekEndJst;
  const prompt = buildWeeklyNewsSearchPrompt(weekFrom, weekTo);
  const response = await createWebSearchJsonResponse({
    input: prompt,
    model: MODELS.WEB_SEARCH,
    temperature: 0,
  });
  const fetchedAt = now.toISOString();
  const items = parseWeeklyNewsResponse(response.text, weekFrom, now).map((item) => ({
    category: item.category,
    confidence: item.confidence,
    fetched_at: fetchedAt,
    model_version: response.model,
    source_domain: item.source_domain,
    source_url: item.source_url,
    status: "draft" as const,
    summary_ja: item.summary_ja,
    title_ja: item.title_ja,
    week_from: weekFrom,
    week_to: weekTo,
    ...(item.published_at ? { published_at: item.published_at } : {}),
    metadata: metadataForWeeklyNews(prompt),
  }));

  if (items.length > 0) {
    const db = getSupabaseServerClient();
    const { error } = await db.from("weekly_news_items").insert(items);

    if (error) {
      throw error;
    }
  }

  return {
    fetched: true,
    items,
    week: { from: weekFrom, to: weekTo },
  };
}
