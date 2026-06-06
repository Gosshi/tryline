import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { MODELS } from "@/lib/llm/models";
import { createWebSearchJsonResponse } from "@/lib/llm/openai";
import { filterAllowedSourcedFacts } from "@/lib/llm/sourced-facts/allowlist";

import type { Json } from "@/lib/db/types";
import type {
  SourcedFact,
  StoredSourcedFact,
} from "@/lib/llm/sourced-facts/types";
import type { ContentType } from "@/lib/llm/types";

const SEARCH_PROMPT_VERSION = "sourced-facts@1.0.0";
const PREVIEW_REFRESH_WINDOW_HOURS = 72;
const PREVIEW_FRESHNESS_HOURS = 24;
const MAX_STORED_FACTS = 8;

type MatchForSourcedFacts = {
  id: string;
  away_team: { english_name: string | null; name: string } | null;
  home_team: { english_name: string | null; name: string } | null;
  competition: {
    family: string | null;
    name: string;
    season: string;
  } | null;
  external_ids: Json;
  kickoff_at: string;
  status: string;
};

type ParsedSourcedFactsResponse = {
  facts?: Array<{
    confidence?: unknown;
    fact?: unknown;
    source_url?: unknown;
  }>;
};

export type FetchSourcedFactsResult = {
  cached: boolean;
  fetched: boolean;
  facts: StoredSourcedFact[];
  skippedReason: string | null;
};

function resolveDisplayName(team: { english_name: string | null; name: string } | null) {
  return team?.english_name ?? team?.name ?? "Unknown";
}

function asObject(value: Json): Record<string, Json> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, Json>;
}

function getRoundName(match: MatchForSourcedFacts): string {
  const externalIds = asObject(match.external_ids);
  const roundName = externalIds.round_name;
  if (typeof roundName === "string") {
    return roundName.toLowerCase();
  }

  return "";
}

export function isSourcedFactsEnabledForMatch(
  match: MatchForSourcedFacts,
): boolean {
  const family = match.competition?.family;
  if (family === "league-one") {
    return true;
  }

  const roundName = getRoundName(match);
  return (
    roundName.includes("final") ||
    roundName.includes("semi") ||
    roundName.includes("quarter") ||
    roundName.includes("playoff") ||
    roundName.includes("knockout")
  );
}

function shouldUseCachedFacts(params: {
  contentType: ContentType;
  fetchedAt: string | null;
  kickoffAt: string;
  now: Date;
}): boolean {
  if (!params.fetchedAt) {
    return false;
  }

  if (params.contentType === "recap") {
    return true;
  }

  const fetchedAt = new Date(params.fetchedAt);
  const kickoffAt = new Date(params.kickoffAt);
  const hoursUntilKickoff =
    (kickoffAt.getTime() - params.now.getTime()) / 3_600_000;

  if (hoursUntilKickoff <= PREVIEW_REFRESH_WINDOW_HOURS) {
    return (
      params.now.getTime() - fetchedAt.getTime() <=
      PREVIEW_FRESHNESS_HOURS * 3_600_000
    );
  }

  return true;
}

function buildSearchPrompt(match: MatchForSourcedFacts, contentType: ContentType) {
  const homeTeam = resolveDisplayName(match.home_team);
  const awayTeam = resolveDisplayName(match.away_team);
  const competitionLabel = [
    match.competition?.name,
    match.competition?.season,
  ]
    .filter(Boolean)
    .join(" ");
  const kickoffDate = match.kickoff_at.slice(0, 10);

  return [
    "Find reliable rugby facts for Tryline match content using web search.",
    `content_type: ${contentType}`,
    `match: ${homeTeam} vs ${awayTeam}`,
    `competition: ${competitionLabel}`,
    `kickoff_date: ${kickoffDate}`,
    [
      "Search intent:",
      "- latest team news",
      "- injuries",
      "- latest lineup changes",
      "- key players",
      "- recent form",
      "- head-to-head",
      "- stakes and knockout/final context",
    ].join("\n"),
    [
      "Rules:",
      "- Return facts only. Do not invent, infer, or summarize unsupported claims.",
      "- Prefer official competition/club sources and RugbyPass/Planet Rugby/RugbyAsia247.",
      "- Include source_url for every fact.",
      "- Use high only for official-source facts or facts confirmed by at least two sources.",
      "- Use medium for a single trusted third-party source.",
      "- Use low for uncertain or weakly supported facts.",
      "- Do not include quotes longer than 15 words. Prefer paraphrased facts.",
      "- Do not return article text or copyrighted prose.",
    ].join("\n"),
    'Return JSON only: {"facts":[{"fact":"...","source_url":"https://...","confidence":"high|medium|low"}]}',
  ].join("\n\n");
}

function parseSourcedFactsResponse(text: string): SourcedFact[] {
  const parsed = JSON.parse(text) as ParsedSourcedFactsResponse;
  return filterAllowedSourcedFacts(Array.isArray(parsed.facts) ? parsed.facts : []);
}

function metadataForFact(params: {
  prompt: string;
  promptVersion: string;
  rawConfidence: string;
}): Json {
  return {
    prompt_hash: createHash("sha256").update(params.prompt).digest("hex"),
    prompt_version: params.promptVersion,
    raw_confidence: params.rawConfidence,
  };
}

export async function loadSourcedFactsForMatch(
  matchId: string,
  contentType: ContentType,
): Promise<StoredSourcedFact[]> {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from("match_sourced_facts")
    .select(
      "content_type, fact, source_url, source_domain, confidence, fetched_at, model_version, metadata",
    )
    .eq("match_id", matchId)
    .in("content_type", [contentType, "shared"])
    .in("confidence", ["high", "medium"])
    .order("fetched_at", { ascending: false })
    .limit(MAX_STORED_FACTS);

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as StoredSourcedFact[];
}

export async function fetchSourcedFactsForMatch(options: {
  contentType: ContentType;
  force?: boolean;
  matchId: string;
  now?: Date;
}): Promise<FetchSourcedFactsResult> {
  const db = getSupabaseServerClient();
  const now = options.now ?? new Date();

  const { data: match, error: matchError } = await db
    .from("matches")
    .select(
      `
        id,
        kickoff_at,
        status,
        external_ids,
        competition:competitions(name, season, family),
        home_team:teams!matches_home_team_id_fkey(name, english_name),
        away_team:teams!matches_away_team_id_fkey(name, english_name)
      `,
    )
    .eq("id", options.matchId)
    .single();

  if (matchError || !match) {
    throw new Error(`match ${options.matchId} not found`);
  }

  const typedMatch = match as unknown as MatchForSourcedFacts;
  if (!isSourcedFactsEnabledForMatch(typedMatch)) {
    return {
      cached: false,
      facts: [],
      fetched: false,
      skippedReason: "not_enabled_for_match",
    };
  }

  const cachedFacts = await loadSourcedFactsForMatch(
    options.matchId,
    options.contentType,
  );
  const newestFetchedAt = cachedFacts[0]?.fetched_at ?? null;
  if (
    !options.force &&
    cachedFacts.length > 0 &&
    shouldUseCachedFacts({
      contentType: options.contentType,
      fetchedAt: newestFetchedAt,
      kickoffAt: typedMatch.kickoff_at,
      now,
    })
  ) {
    return {
      cached: true,
      facts: cachedFacts,
      fetched: false,
      skippedReason: null,
    };
  }

  const prompt = buildSearchPrompt(typedMatch, options.contentType);
  const response = await createWebSearchJsonResponse({
    model: MODELS.WEB_SEARCH,
    input: prompt,
    temperature: 0,
  });
  const facts = parseSourcedFactsResponse(response.text);
  const fetchedAt = now.toISOString();
  const rows = facts.slice(0, MAX_STORED_FACTS).map((fact) => ({
    confidence: fact.confidence,
    content_type: options.contentType,
    fact: fact.fact,
    fetched_at: fetchedAt,
    match_id: options.matchId,
    metadata: metadataForFact({
      prompt,
      promptVersion: SEARCH_PROMPT_VERSION,
      rawConfidence: fact.confidence,
    }),
    model_version: response.model,
    source_domain: fact.source_domain,
    source_url: fact.source_url,
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await db
      .from("match_sourced_facts")
      .upsert(rows, { onConflict: "match_id,fact" });

    if (upsertError) {
      throw upsertError;
    }
  }

  return {
    cached: false,
    facts: rows as StoredSourcedFact[],
    fetched: true,
    skippedReason: null,
  };
}
