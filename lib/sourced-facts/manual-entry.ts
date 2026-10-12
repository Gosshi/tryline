import { getSupabaseServerClient } from "@/lib/db/server";
import {
  OWNER_VERIFIABLE_SOURCE_URL_STATUSES,
  validateSourceUrl,
} from "@/lib/discord/source-url";

import type { ParsedResearchPaste } from "@/lib/discord/research-paste";
import type { ContentType } from "@/lib/llm/types";

export type ManualFactSaveResult = {
  savedCount: number;
  duplicateCount: number;
  submittedCount: number;
  acceptedSourceCount: number;
  contentType: ContentType | null;
  matchMissing: boolean;
  rejectedSources: Array<{ sourceUrl: string; reason: string }>;
  ownerVerifiedSources: Array<{
    sourceDomain: string;
    sourceUrl: string;
    status: number;
  }>;
};

export async function saveManualResearchFacts(input: {
  matchId: string;
  paste: ParsedResearchPaste;
  entryPath: "discord_research_paste" | "ops_bulk_paste";
}): Promise<ManualFactSaveResult> {
  const emptyResult: ManualFactSaveResult = {
    savedCount: 0,
    duplicateCount: 0,
    submittedCount: 0,
    acceptedSourceCount: 0,
    contentType: null,
    matchMissing: false,
    rejectedSources: [],
    ownerVerifiedSources: [],
  };
  const sourceBlocks = input.paste.sources.filter(
    (source) => source.facts.length > 0,
  );
  const validatedSources = new Map<
    string,
    Awaited<ReturnType<typeof validateSourceUrl>>
  >();
  const urls = [...new Set(sourceBlocks.map((source) => source.sourceUrl))];
  let nextUrl = 0;
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          input.entryPath === "ops_bulk_paste" ? 4 : 1,
          urls.length,
        ),
      },
      async () => {
        while (nextUrl < urls.length) {
          const url = urls[nextUrl++]!;
          validatedSources.set(url, await validateSourceUrl(url));
        }
      },
    ),
  );

  const rejectedSources: Array<{ sourceUrl: string; reason: string }> = [];
  const ownerVerifiedSources: Array<{
    sourceDomain: string;
    sourceUrl: string;
    status: number;
  }> = [];
  const rows: Array<{
    confidence: "high";
    fact: string;
    fact_ja: string;
    match_id: string;
    metadata: {
      entry_method: "manual";
      entry_path: "discord_research_paste" | "ops_bulk_paste";
      paste_index: number;
      source_url_check?: "owner_verified";
      source_url_http_status?: number;
    };
    model_version: "manual";
    source_domain: string;
    source_url: string;
  }> = [];
  const acceptedSourceUrls = new Set<string>();
  for (const source of sourceBlocks) {
    const validation = validatedSources.get(source.sourceUrl);
    if (!validation) continue;
    const ownerVerifiedStatus =
      !validation.ok &&
      validation.status !== null &&
      OWNER_VERIFIABLE_SOURCE_URL_STATUSES.has(validation.status)
        ? validation.status
        : null;
    if (!validation.ok && ownerVerifiedStatus === null) {
      if (
        !rejectedSources.some(
          (rejected) => rejected.sourceUrl === source.sourceUrl,
        )
      ) {
        rejectedSources.push({
          sourceUrl: source.sourceUrl,
          reason: validation.reason,
        });
      }
      continue;
    }

    acceptedSourceUrls.add(source.sourceUrl);
    const sourceDomain = validation.ok
      ? validation.sourceDomain
      : new URL(source.sourceUrl).hostname;
    if (
      ownerVerifiedStatus !== null &&
      !ownerVerifiedSources.some(
        (verified) => verified.sourceUrl === source.sourceUrl,
      )
    ) {
      ownerVerifiedSources.push({
        sourceDomain,
        sourceUrl: source.sourceUrl,
        status: ownerVerifiedStatus,
      });
    }
    for (const { fact } of source.facts) {
      rows.push({
        confidence: "high",
        fact,
        fact_ja: fact,
        match_id: input.matchId,
        metadata: {
          entry_method: "manual",
          entry_path: input.entryPath,
          paste_index: rows.length,
          ...(ownerVerifiedStatus === null
            ? {}
            : {
                source_url_check: "owner_verified",
                source_url_http_status: ownerVerifiedStatus,
              }),
        },
        model_version: "manual",
        source_domain: sourceDomain,
        source_url: source.sourceUrl,
      });
    }
  }

  if (rows.length === 0) {
    return { ...emptyResult, rejectedSources, ownerVerifiedSources };
  }

  const db = getSupabaseServerClient();
  const { data: match, error: matchError } = await db
    .from("matches")
    .select("kickoff_at")
    .eq("id", input.matchId)
    .maybeSingle();
  if (matchError) {
    throw matchError;
  }
  if (!match) {
    return {
      ...emptyResult,
      matchMissing: true,
      rejectedSources,
      ownerVerifiedSources,
    };
  }

  const contentType: ContentType =
    new Date(match.kickoff_at).getTime() > Date.now() ? "preview" : "recap";
  const finalRows = rows.map((row) => ({ ...row, content_type: contentType }));
  let savedRows: Array<{ fact: string }> = [];
  if (finalRows.length > 0) {
    const { data, error: upsertError } = await db
      .from("match_sourced_facts")
      .upsert(finalRows, {
        ignoreDuplicates: true,
        onConflict: "match_id,content_type,fact",
      })
      .select("fact");
    if (upsertError) {
      throw upsertError;
    }
    savedRows = data ?? [];
  }

  const savedCount = savedRows.length;
  return {
    savedCount,
    duplicateCount: finalRows.length - savedCount,
    submittedCount: finalRows.length,
    acceptedSourceCount: acceptedSourceUrls.size,
    contentType,
    matchMissing: false,
    rejectedSources,
    ownerVerifiedSources,
  };
}

export async function decideManualFactRegeneration(input: {
  matchId: string;
  contentType: ContentType;
}): Promise<"regenerate" | "generate" | "none"> {
  const { data, error } = await getSupabaseServerClient()
    .from("match_content")
    .select("status")
    .eq("match_id", input.matchId)
    .eq("content_type", input.contentType)
    .eq("language", "ja")
    .in("status", ["published", "draft"])
    .maybeSingle();
  if (error) throw error;
  return data ? "regenerate" : "none";
}
