import type { ContentType } from "@/lib/llm/types";

export type SourcedFactConfidence = "high" | "medium" | "low";

export type SourcedFact = {
  fact: string;
  source_url: string;
  source_domain: string;
  confidence: SourcedFactConfidence;
};

export type StoredSourcedFact = SourcedFact & {
  content_type: ContentType | "shared";
  fetched_at: string;
  model_version: string;
  metadata: Record<string, unknown>;
};
