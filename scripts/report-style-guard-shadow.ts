import { getSupabaseServerClient } from "@/lib/db/server";
import {
  evaluateStyleGuardShadow,
  RECENT_ARTICLE_LIMIT,
  type RecentStyleArticle,
  type StyleGuardShadowResult,
} from "@/lib/llm/style-guard";

import type { Json } from "@/lib/db/types";
import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type BatchArticle = {
  contentMd: string;
  contentType: "preview" | "recap";
  id: string;
  japaneseQuality: number;
};

export type StyleGuardShadowReport = {
  articles: Array<{
    contentType: "preview" | "recap";
    id: string;
    result: StyleGuardShadowResult;
  }>;
  generatedAt: string;
  retryEquivalentCount: number;
  total: number;
};

function readJapaneseQuality(qaScores: Json) {
  if (
    typeof qaScores !== "object" ||
    qaScores === null ||
    Array.isArray(qaScores)
  ) {
    return 0;
  }

  const scores = qaScores.scores;
  if (
    typeof scores !== "object" ||
    scores === null ||
    Array.isArray(scores) ||
    typeof scores.japanese_quality !== "number"
  ) {
    return 0;
  }

  return scores.japanese_quality;
}

export function createStyleGuardShadowReport(
  articles: BatchArticle[],
  generatedAt = new Date().toISOString(),
): StyleGuardShadowReport {
  const reportArticles = articles.map((article, index) => {
    const recentArticles: RecentStyleArticle[] = articles
      .slice(0, index)
      .filter((candidate) => candidate.contentType === article.contentType)
      .slice(0, RECENT_ARTICLE_LIMIT)
      .map((candidate) => ({ content: candidate.contentMd, id: candidate.id }));
    const result = evaluateStyleGuardShadow({
      content: article.contentMd,
      japaneseQuality: article.japaneseQuality,
      recentArticles,
    });

    return { contentType: article.contentType, id: article.id, result };
  });

  return {
    articles: reportArticles,
    generatedAt,
    retryEquivalentCount: reportArticles.filter(
      (article) => article.result.retryEquivalent,
    ).length,
    total: reportArticles.length,
  };
}

export async function runStyleGuardShadowReport(
  db: SupabaseClient<Database>,
  limit = 100,
) {
  const { data, error } = await db
    .from("match_content")
    .select("id, content_type, content_md, qa_scores")
    .eq("status", "published")
    .eq("language", "ja")
    .in("content_type", ["preview", "recap"])
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return createStyleGuardShadowReport(
    (data ?? []).map((article) => ({
      contentMd: article.content_md,
      contentType: article.content_type as "preview" | "recap",
      id: article.id,
      japaneseQuality: readJapaneseQuality(article.qa_scores),
    })),
  );
}

async function main() {
  const report = await runStyleGuardShadowReport(getSupabaseServerClient());
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1]?.endsWith("report-style-guard-shadow.ts")) {
  void main();
}
