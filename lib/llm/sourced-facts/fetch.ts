import { createHash } from "node:crypto";

import { getSupabaseServerClient } from "@/lib/db/server";
import { MODELS } from "@/lib/llm/models";
import { createWebSearchJsonResponse } from "@/lib/llm/openai";
import {
  filterAllowedSourcedFacts,
  isAllowedSourcedFactDomain,
  SOURCED_FACT_ALLOWED_DOMAINS,
} from "@/lib/llm/sourced-facts/allowlist";
import { fetchJrfuMatchLineup } from "@/lib/scrapers/jrfu-lineups";

import type { Database, Json } from "@/lib/db/types";
import type {
  SourcedFact,
  SourcedFactRejection,
  StoredSourcedFact,
} from "@/lib/llm/sourced-facts/types";
import type { ContentType } from "@/lib/llm/types";

export const SEARCH_PROMPT_VERSION = "sourced-facts@1.4.0";
const PREVIEW_REFRESH_WINDOW_HOURS = 72;
const PREVIEW_FRESHNESS_HOURS = 24;
const MAX_STORED_FACTS = 8;
const JRFU_LINEUP_MODEL_VERSION = "jrfu-lineups@1.0.0";
const STATISTICAL_FACT_PATTERN =
  /\d+(?:\.\d+)?\s*%|\b(?:penalt\w*|tackles?|possession|territory|turnovers?|lineouts?|scrums?|carries|metres?|meters?)\b/i;

type MatchForSourcedFacts = {
  id: string;
  away_team: {
    english_name: string | null;
    name: string;
    name_ja: string | null;
    slug?: string | null;
  } | null;
  home_team: {
    english_name: string | null;
    name: string;
    name_ja: string | null;
    slug?: string | null;
  } | null;
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
    fact_ja?: unknown;
    source_url?: unknown;
  }>;
};

export type FetchSourcedFactsResult = {
  cached: boolean;
  fetched: boolean;
  facts: StoredSourcedFact[];
  skippedReason: string | null;
};

type SourcedFactInsert =
  Database["public"]["Tables"]["match_sourced_facts"]["Insert"];

export function isManualSourcedFact(
  row: Pick<StoredSourcedFact, "metadata">,
) {
  return row.metadata?.entry_method === "manual";
}

/**
 * A search response is a complete latest snapshot for each source domain.
 * Replacing only domains present in a non-empty response prevents differently
 * worded retries from accumulating while preserving other sources and a
 * previous snapshot when the search returns no facts.
 */
export async function replaceSourcedFactsForSourceDomains(
  db: ReturnType<typeof getSupabaseServerClient>,
  rows: SourcedFactInsert[],
) {
  if (rows.length === 0) {
    return;
  }

  const matchId = rows[0]?.match_id;
  const contentType = rows[0]?.content_type;
  if (!matchId || !contentType) {
    throw new Error(
      "Sourced fact replacement rows require match and content type",
    );
  }

  const sourceDomains = [...new Set(rows.map((row) => row.source_domain))];
  for (const sourceDomain of sourceDomains) {
    const { error: deleteError } = await db
      .from("match_sourced_facts")
      .delete()
      .eq("match_id", matchId)
      .eq("content_type", contentType)
      .eq("source_domain", sourceDomain)
      // Preserve manual facts even when their source domain is refreshed.
      .or("metadata->>entry_method.is.null,metadata->>entry_method.neq.manual");

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error: upsertError } = await db
    .from("match_sourced_facts")
    .upsert(rows, { onConflict: "match_id,content_type,fact" });

  if (upsertError) {
    throw upsertError;
  }
}

function resolveDisplayName(
  team: { english_name: string | null; name: string } | null,
) {
  return team?.english_name ?? team?.name ?? "Unknown";
}

export function isSourcedFactsEnabledForMatch(
  _match: MatchForSourcedFacts,
): boolean {
  return true;
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

function getCachedPromptVersion(facts: StoredSourcedFact[]): string | null {
  const version = facts
    .map((fact) => fact.metadata?.prompt_version)
    .find((value): value is string => typeof value === "string");
  return typeof version === "string" ? version : null;
}

function isJapanMatch(match: MatchForSourcedFacts) {
  return match.home_team?.slug === "japan" || match.away_team?.slug === "japan";
}

function formatJrfuPlayers(
  players: Array<{ jersey_number: number; name: string }>,
) {
  return players
    .sort((first, second) => first.jersey_number - second.jersey_number)
    .map((player) => `${player.jersey_number} ${player.name}`)
    .join("、");
}

export function buildJrfuLineupSourcedFacts(
  lineup: Awaited<ReturnType<typeof fetchJrfuMatchLineup>>,
) {
  if (!lineup) {
    return [];
  }

  return [
    { label: "日本代表", players: lineup.japan_players },
    { label: lineup.opponent_name, players: lineup.opponent_players },
  ].flatMap(({ label, players }) => {
    const starters = formatJrfuPlayers(
      players.filter((player) => player.is_starter),
    );
    const reserves = formatJrfuPlayers(
      players.filter((player) => !player.is_starter),
    );

    return [
      `${label}の先発は${starters}。`,
      `${label}のリザーブは${reserves}。`,
    ].map((fact) => ({
      confidence: "high" as const,
      fact,
      fact_ja: fact,
      source_domain: "rugby-japan.jp",
      source_url: lineup.source_url,
    }));
  });
}

async function fetchJrfuLineupSourcedFacts(match: MatchForSourcedFacts) {
  if (!isJapanMatch(match)) {
    return [];
  }

  try {
    const lineup = await fetchJrfuMatchLineup(match.kickoff_at);

    if (!lineup) {
      console.warn(
        `[sourced-facts] JRFU lineup is unavailable for match_id=${match.id}; continuing with web search.`,
      );
      return [];
    }

    return buildJrfuLineupSourcedFacts(lineup);
  } catch (error) {
    console.warn(
      `[sourced-facts] Failed to fetch JRFU lineup for match_id=${match.id}; continuing with web search.`,
      error,
    );
    return [];
  }
}

function metadataForJrfuLineupFact(): Json {
  return {
    deterministic: true,
    source: "jrfu_match_lineup",
  };
}

function containsStatisticalFact(fact: string): boolean {
  return STATISTICAL_FACT_PATTERN.test(fact);
}

export function buildSearchPrompt(
  match: MatchForSourcedFacts,
  contentType: ContentType,
  allowedDomains: readonly string[] = SOURCED_FACT_ALLOWED_DOMAINS,
) {
  const homeTeam = resolveDisplayName(match.home_team);
  const awayTeam = resolveDisplayName(match.away_team);
  const competitionLabel = [match.competition?.name, match.competition?.season]
    .filter(Boolean)
    .join(" ");
  const kickoffDate = match.kickoff_at.slice(0, 10);
  const searchIntent =
    contentType === "recap"
      ? [
          "Search intent (post-match):",
          "- official post-match statistics: possession %, territory %, tackle counts, carries, metres gained, lineout/scrum success, turnovers, penalty counts",
          "- the official Player of the Match / Man of the Match award (only if officially announced; include the awarding body)",
          "- notable records or milestones set in this match (e.g., career try record, debut)",
          "- significant injuries sustained during the match",
          "- yellow/red cards, sin-bins, permanent send-offs, and any resulting suspensions (player name, minute if reported)",
          "- brief post-match comments from head coaches or captains (paraphrased, max 15 words per quote)",
        ].join("\n")
      : [
          "Search intent:",
          "- latest team news",
          "- injuries",
          "- latest lineup changes",
          "- player news such as retirements, transfers, and availability",
          "- key players",
          "- stakes and knockout/final context",
          "- how the previous meeting between these two teams ended, focusing on narrative details a bare scoreline would not capture (e.g., a missed match-winning penalty, a last-minute momentum swing, a memorable individual play). Do NOT restate the final score or the date of that match — those are already known; only report contextual/dramatic details not captured by the score itself",
        ].join("\n");
  const contentTypeRules =
    contentType === "recap"
      ? [
          '- For numeric statistics, state the stat name and both teams\' values exactly as reported (e.g., "Possession: Glasgow 54% - Bulls 46%"). Never estimate or round.',
          "- For every fact, include fact_ja: a natural Japanese news-style paraphrase of fact, around 80-160 Japanese characters.",
          "- fact_ja must only restate the information in fact. Do not add, infer, or embellish any detail.",
        ]
      : [
          "- For every fact, include fact_ja: a natural Japanese news-style paraphrase of fact, around 80-160 Japanese characters.",
          "- fact_ja must only restate the information in fact. Do not add, infer, or embellish any detail.",
        ];
  const responseSchema =
    contentType === "recap"
      ? '{"facts":[{"fact":"...","fact_ja":"...","source_url":"https://...","confidence":"high|medium|low"}]}'
      : '{"facts":[{"fact":"...","fact_ja":"...","source_url":"https://...","confidence":"high|medium|low"}]}';
  const allowedDomainList = allowedDomains.join(", ");

  return [
    "Find reliable rugby facts for Tryline match content using web search.",
    `content_type: ${contentType}`,
    `match: ${homeTeam} vs ${awayTeam}`,
    `competition: ${competitionLabel}`,
    `kickoff_date: ${kickoffDate}`,
    searchIntent,
    [
      "Rules:",
      "- Return facts only. Do not invent, infer, or summarize unsupported claims.",
      `- Only return facts from these allowed source domains: ${allowedDomainList}. Sources outside this list will not be accepted.`,
      "- Include source_url for every fact.",
      "- Use high only for official-source facts or facts confirmed by at least two sources.",
      "- Use medium for a single trusted third-party source.",
      "- Use low for uncertain or weakly supported facts.",
      "- Do not return past result scores, league standings, or win/loss records (the database is authoritative for these).",
      "- Do not return past-match dates or relative recency phrasing such as 'most recent', 'previous meeting', or 'last time they met' (the database is authoritative for match dates).",
      "- Do not include quotes longer than 15 words. Prefer paraphrased facts.",
      "- Do not return article text or copyrighted prose.",
      ...contentTypeRules,
    ].join("\n"),
    `Return JSON only: ${responseSchema}`,
  ].join("\n\n");
}

function extractJsonObjectText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export function parseSourcedFactsResponse(
  text: string,
  options?: Parameters<typeof filterAllowedSourcedFacts>[1],
): SourcedFact[] {
  const jsonText = extractJsonObjectText(text);
  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText) as ParsedSourcedFactsResponse;
    return filterAllowedSourcedFacts(
      Array.isArray(parsed.facts) ? parsed.facts : [],
      options,
    );
  } catch {
    return [];
  }
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

  const rows = (data ?? []) as unknown as StoredSourcedFact[];
  const allowedRows = rows.filter(
    (row) =>
      isAllowedSourcedFactDomain(row.source_domain) || isManualSourcedFact(row),
  );
  const excludedCount = rows.length - allowedRows.length;

  if (excludedCount > 0) {
    console.warn(
      `[sourced-facts] Excluded ${excludedCount} non-allowlisted cached fact(s) for match_id=${matchId}.`,
    );
  }

  return allowedRows;
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
        home_team:teams!matches_home_team_id_fkey(name, name_ja, english_name, slug),
        away_team:teams!matches_away_team_id_fkey(name, name_ja, english_name, slug)
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
  const jrfuFacts =
    options.contentType === "preview"
      ? await fetchJrfuLineupSourcedFacts(typedMatch)
      : [];
  const jrfuRows = jrfuFacts.map((fact) => ({
    ...fact,
    content_type: options.contentType,
    fetched_at: now.toISOString(),
    match_id: options.matchId,
    metadata: metadataForJrfuLineupFact(),
    model_version: JRFU_LINEUP_MODEL_VERSION,
  }));

  if (jrfuRows.length > 0) {
    await replaceSourcedFactsForSourceDomains(db, jrfuRows);
  }

  const cachedSearchFacts = cachedFacts.filter(
    (fact) => typeof fact.metadata?.prompt_version === "string",
  );
  const newestFetchedAt = cachedSearchFacts[0]?.fetched_at ?? null;
  const cachedPromptVersion = getCachedPromptVersion(cachedSearchFacts);
  if (
    !options.force &&
    cachedSearchFacts.length > 0 &&
    cachedPromptVersion === SEARCH_PROMPT_VERSION &&
    shouldUseCachedFacts({
      contentType: options.contentType,
      fetchedAt: newestFetchedAt,
      kickoffAt: typedMatch.kickoff_at,
      now,
    })
  ) {
    return {
      cached: true,
      facts: [...jrfuRows, ...cachedFacts] as StoredSourcedFact[],
      fetched: false,
      skippedReason: null,
    };
  }

  const prompt = buildSearchPrompt(typedMatch, options.contentType);
  const relevance = {
    kickoffAt: typedMatch.kickoff_at,
    teamNames: [typedMatch.home_team, typedMatch.away_team].flatMap((team) =>
      team
        ? [team.name, team.name_ja, team.english_name].filter(
            (name): name is string => Boolean(name),
          )
        : [],
    ),
  };
  async function searchSourcedFacts() {
    const response = await createWebSearchJsonResponse({
      model: MODELS.WEB_SEARCH,
      input: prompt,
    });
    const rejectedFacts: SourcedFactRejection[] = [];
    const facts = parseSourcedFactsResponse(response.text, {
      rejected: rejectedFacts,
      relevance,
    });

    return { facts, rejectedFacts, response };
  }

  let searchResult = await searchSourcedFacts();
  if (
    options.contentType === "recap" &&
    (searchResult.facts.length === 0 ||
      !searchResult.facts.some((fact) => containsStatisticalFact(fact.fact)))
  ) {
    const retryResult = await searchSourcedFacts();
    searchResult = {
      ...retryResult,
      rejectedFacts: [
        ...searchResult.rejectedFacts,
        ...retryResult.rejectedFacts,
      ],
    };
  }

  const { facts, rejectedFacts, response } = searchResult;
  const rejectedDomainCounts = rejectedFacts.reduce<Record<string, number>>(
    (counts, rejection) => {
      if (
        rejection.reason === "domain_not_allowed" &&
        rejection.source_domain
      ) {
        counts[rejection.source_domain] =
          (counts[rejection.source_domain] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );
  if (Object.keys(rejectedDomainCounts).length > 0) {
    console.info(
      "Sourced facts rejected by disallowed domain",
      rejectedDomainCounts,
    );
  }
  const fetchedAt = now.toISOString();
  const rows = facts.slice(0, MAX_STORED_FACTS).map((fact) => ({
    confidence: fact.confidence,
    content_type: options.contentType,
    fact: fact.fact,
    fact_ja: fact.fact_ja ?? null,
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
    await replaceSourcedFactsForSourceDomains(db, rows);
  }

  return {
    cached: false,
    facts: [...jrfuRows, ...rows] as StoredSourcedFact[],
    fetched: true,
    skippedReason:
      rejectedFacts.length > 0
        ? `sourced_facts_filtered:${[
            ...new Set(rejectedFacts.map((item) => item.reason)),
          ].join(",")}`
        : null,
  };
}
