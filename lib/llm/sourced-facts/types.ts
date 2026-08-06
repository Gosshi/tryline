import type { ContentType } from "@/lib/llm/types";

export type SourcedFactConfidence = "high" | "medium" | "low";

export type SourcedFact = {
  fact: string;
  fact_ja?: string;
  source_url: string;
  source_domain: string;
  confidence: SourcedFactConfidence;
};

export type SourcedFactRejectionReason =
  | "db_authoritative_score"
  | "db_authoritative_relative_recency"
  | "domain_not_allowed"
  | "unrelated_fixture";

export type SourcedFactRejection = {
  fact: string;
  reason: SourcedFactRejectionReason;
  source_domain?: string;
};

export type StoredSourcedFact = SourcedFact & {
  content_type: ContentType | "shared";
  fetched_at: string;
  model_version: string;
  metadata: Record<string, unknown> | null;
};
