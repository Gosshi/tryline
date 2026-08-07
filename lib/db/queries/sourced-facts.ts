import { getSupabasePublicServerClient } from "@/lib/db/public-server";
import { isAllowedSourcedFactDomain } from "@/lib/llm/sourced-facts/allowlist";

export type SourcedFactCounts = {
  preview: number;
  recap: number;
};

export type SourcedFactSource = {
  domain: string;
  sourceUrl: string | null;
};

export type SourcedFactSummary = SourcedFactCounts & {
  previewSources: SourcedFactSource[];
  recapSources: SourcedFactSource[];
};

export type StorySourcedFact = {
  confidence: string;
  contentType: string;
  fact: string;
  factJa: string | null;
  fetchedAt: string;
  id: string;
  matchId: string;
  sourceDomain: string;
  sourceUrl: string;
};

function addFactToSummary(
  summary: { count: number; sources: SourcedFactSource[] },
  fact: { source_domain: string | null; source_url: string | null },
) {
  if (!isAllowedSourcedFactDomain(fact.source_domain)) {
    return;
  }

  summary.count += 1;
  const domain = fact.source_domain!;
  const source = summary.sources.find((item) => item.domain === domain);

  if (source) {
    if (!source.sourceUrl && fact.source_url) {
      source.sourceUrl = fact.source_url;
    }
    return;
  }

  summary.sources.push({
    domain,
    sourceUrl: fact.source_url,
  });
}

export async function getSourcedFactSummaryForMatch(
  matchId: string,
): Promise<SourcedFactSummary> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_sourced_facts")
    .select("content_type, source_domain, source_url")
    .eq("match_id", matchId)
    .in("content_type", ["preview", "recap", "shared"])
    .in("confidence", ["high", "medium"]);

  if (error) {
    throw error;
  }

  const preview = { count: 0, sources: [] as SourcedFactSource[] };
  const recap = { count: 0, sources: [] as SourcedFactSource[] };

  for (const fact of data ?? []) {
    if (fact.content_type === "preview" || fact.content_type === "shared") {
      addFactToSummary(preview, fact);
    }

    if (fact.content_type === "recap" || fact.content_type === "shared") {
      addFactToSummary(recap, fact);
    }
  }

  return {
    preview: preview.count,
    previewSources: preview.sources,
    recap: recap.count,
    recapSources: recap.sources,
  };
}

export async function getStorySourcedFactsForMatches(
  matchIds: string[],
): Promise<StorySourcedFact[]> {
  if (matchIds.length === 0) {
    return [];
  }

  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_sourced_facts")
    .select(
      "id, match_id, content_type, confidence, fact, fact_ja, fetched_at, source_domain, source_url",
    )
    .in("match_id", matchIds)
    .in("content_type", ["preview", "recap", "shared"])
    .in("confidence", ["high", "medium"]);

  if (error) {
    throw error;
  }

  return (data ?? []).map((fact) => ({
    confidence: fact.confidence,
    contentType: fact.content_type,
    fact: fact.fact,
    factJa: fact.fact_ja,
    fetchedAt: fact.fetched_at,
    id: fact.id,
    matchId: fact.match_id,
    sourceDomain: fact.source_domain,
    sourceUrl: fact.source_url,
  }));
}
