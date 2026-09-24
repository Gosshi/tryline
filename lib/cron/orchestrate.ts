import { chunkArray } from "@/lib/db/pagination";

import {
  previewCandidateUpperBound,
  recapCandidateUpperBound,
  RECAP_MAX_AGE_DAYS,
} from "./content-windows";

import type { Database } from "@/lib/db/types";
import type { ContentLanguage, ContentType } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;
const ORCHESTRATE_MAX_DURATION_MS = 300_000;
const GENERATION_WORST_CASE_MS = 220_000;
const ORCHESTRATE_FINISH_MARGIN_MS = 15_000;
const ORCHESTRATE_START_DEADLINE_MS =
  ORCHESTRATE_MAX_DURATION_MS -
  GENERATION_WORST_CASE_MS -
  ORCHESTRATE_FINISH_MARGIN_MS;
const PREVIEW_CONCURRENCY = 3;
const RECAP_BATCH_SIZE = 10;
const RECAP_EVENT_LOOKUP_CANDIDATES = 60;
const MATCH_CONTENT_MATCH_ID_CHUNK_SIZE = 500;

type LineupIngestOutcome = "triggered" | "no_url";

type Relation<T> = T | T[] | null;

type MatchCandidate = {
  id: string;
  competition: Relation<{ family: string | null }>;
};

export type RecapSkipEntry = {
  competitionFamily: string | null;
  matchId: string;
  reason: string;
};

export type RecapExcludedEntry = {
  matchId: string;
};

export type RecapSkipReport = {
  batchSize: number;
  excludedMatches: RecapExcludedEntry[];
  matches: RecapSkipEntry[];
  skippedCount: number;
  timeBudgetSkipped: {
    preview: number;
    recap: number;
  };
};

export type OrchestrateResult = {
  previews: {
    triggered: number;
    skipped: number;
  };
  lineups: {
    triggered: number;
    no_url: number;
    preview_triggered: number;
    preview_no_url: number;
    recap_triggered: number;
    recap_no_url: number;
  };
  recaps: {
    triggered: number;
    skipped: number;
  };
  remaining: {
    previews: number;
    recaps: number;
  };
};

export type PushMatchInfo = {
  awayScore: number;
  awayTeamName: string;
  awayTeamSlug: string;
  homeScore: number;
  homeTeamName: string;
  homeTeamSlug: string;
  matchId: string;
};

export type RunOrchestrateDeps = {
  db: SupabaseClient<Database>;
  generateContent: (
    matchId: string,
    contentType: ContentType,
    language?: ContentLanguage,
  ) => Promise<{ skipReason?: string; status?: string } | void>;
  fetchSourcedFacts?: (
    matchId: string,
    contentType: ContentType,
  ) => Promise<void>;
  ingestLineups: (
    matchId: string,
    competitionFamily?: string | null,
  ) => Promise<LineupIngestOutcome>;
  getCurrentTime?: () => number;
  now?: Date;
  notifyRecapSkipped?: (report: RecapSkipReport) => Promise<void>;
  sendPushNotification?: (info: PushMatchInfo) => Promise<void>;
};

function firstRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

function isLeagueOneMatch(match: MatchCandidate): boolean {
  return firstRelation(match.competition)?.family === "league-one";
}

async function getMatchIdsMissingContent(params: {
  db: SupabaseClient<Database>;
  status: "scheduled" | "finished";
  contentType: ContentType;
  kickoffGte?: string;
  kickoffLt?: string;
  kickoffLte?: string;
  orderByKickoff?: "asc" | "desc";
}): Promise<{ eligibleMatches: MatchCandidate[]; skippedCount: number }> {
  let matchQuery = params.db
    .from("matches")
    .select("id, competition:competitions!matches_competition_id_fkey (family)")
    .eq("status", params.status);

  if (params.kickoffGte) {
    matchQuery = matchQuery.gte("kickoff_at", params.kickoffGte);
  }

  if (params.kickoffLte) {
    matchQuery = matchQuery.lte("kickoff_at", params.kickoffLte);
  }

  if (params.kickoffLt) {
    matchQuery = matchQuery.lt("kickoff_at", params.kickoffLt);
  }

  if (params.orderByKickoff) {
    matchQuery = matchQuery.order("kickoff_at", {
      ascending: params.orderByKickoff === "asc",
    });
  }

  const { data: matches, error: matchError } = await matchQuery;

  if (matchError) {
    throw matchError;
  }

  const allMatches = matches as unknown as MatchCandidate[];
  const allMatchIds = allMatches.map((match) => match.id);

  if (allMatchIds.length === 0) {
    return {
      eligibleMatches: [] as MatchCandidate[],
      skippedCount: 0,
    };
  }

  const existingIds = new Set<string>();

  for (const matchIdChunk of chunkArray(
    allMatchIds,
    MATCH_CONTENT_MATCH_ID_CHUNK_SIZE,
  )) {
    const { data: existingContent, error: contentError } = await params.db
      .from("match_content")
      .select("match_id")
      .eq("content_type", params.contentType)
      .eq("language", "ja")
      .in("status", [...EXISTING_CONTENT_STATUSES])
      .in("match_id", matchIdChunk);

    if (contentError) {
      throw contentError;
    }

    for (const row of existingContent) {
      existingIds.add(row.match_id);
    }
  }
  const eligibleMatches = allMatches.filter(
    (match) => !existingIds.has(match.id),
  );

  return {
    eligibleMatches,
    skippedCount: allMatchIds.length - eligibleMatches.length,
  };
}

async function generateLeagueOneEnglishContent(
  deps: RunOrchestrateDeps,
  match: MatchCandidate,
  contentType: ContentType,
) {
  if (!isLeagueOneMatch(match)) {
    return;
  }

  try {
    await deps.generateContent(match.id, contentType, "en");
  } catch (error) {
    console.error("[orchestrate] League One English generation failed", {
      matchId: match.id,
      contentType,
      error,
    });
  }
}

async function notifyRecapReady(
  deps: RunOrchestrateDeps,
  matchId: string,
): Promise<void> {
  if (!deps.sendPushNotification) {
    return;
  }

  try {
    const { data: match } = await deps.db
      .from("matches")
      .select(
        `
          id,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey (slug, name),
          away_team:teams!matches_away_team_id_fkey (slug, name)
        `,
      )
      .eq("id", matchId)
      .single();

    if (
      match?.home_score !== null &&
      match?.away_score !== null &&
      match?.home_team &&
      match?.away_team
    ) {
      await deps.sendPushNotification({
        awayScore: match.away_score,
        awayTeamName: match.away_team.name,
        awayTeamSlug: match.away_team.slug,
        homeScore: match.home_score,
        homeTeamName: match.home_team.name,
        homeTeamSlug: match.home_team.slug,
        matchId,
      });
    }
  } catch (pushError) {
    console.warn("[orchestrate] push notification failed", {
      matchId,
      pushError,
    });
  }
}

type ContentQueueEntry = {
  contentType: ContentType;
  match: MatchCandidate;
};

async function processWithConcurrency(params: {
  canStart: () => boolean;
  entries: ContentQueueEntry[];
  processEntry: (entry: ContentQueueEntry) => Promise<void>;
}): Promise<{ previews: number; recaps: number }> {
  let nextEntryIndex = 0;
  const remaining = { previews: 0, recaps: 0 };
  let stopped = false;

  const worker = async () => {
    while (!stopped && nextEntryIndex < params.entries.length) {
      if (!params.canStart()) {
        for (const entry of params.entries.slice(nextEntryIndex)) {
          remaining[entry.contentType === "preview" ? "previews" : "recaps"] +=
            1;
        }
        nextEntryIndex = params.entries.length;
        stopped = true;
        return;
      }

      const entry = params.entries[nextEntryIndex];
      if (entry === undefined) {
        return;
      }
      nextEntryIndex += 1;
      await params.processEntry(entry);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(PREVIEW_CONCURRENCY, params.entries.length) },
      worker,
    ),
  );

  return remaining;
}

export async function runOrchestrate(
  deps: RunOrchestrateDeps,
): Promise<OrchestrateResult> {
  const getCurrentTime = deps.getCurrentTime ?? Date.now;
  const startedAt = getCurrentTime();
  const canStartGeneration = () =>
    getCurrentTime() - startedAt <= ORCHESTRATE_START_DEADLINE_MS;
  const now = deps.now ?? new Date();

  const previewCandidates = await getMatchIdsMissingContent({
    db: deps.db,
    status: "scheduled",
    contentType: "preview",
    kickoffGte: now.toISOString(),
    kickoffLt: previewCandidateUpperBound(now),
    orderByKickoff: "asc",
  });

  const recapCandidates = await getMatchIdsMissingContent({
    db: deps.db,
    status: "finished",
    contentType: "recap",
    kickoffGte: new Date(
      now.getTime() - RECAP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
    kickoffLte: recapCandidateUpperBound(now),
    orderByKickoff: "desc",
  });
  const recapEventLookupMatches = recapCandidates.eligibleMatches.slice(
    0,
    RECAP_EVENT_LOOKUP_CANDIDATES,
  );
  const recapEventLookupMatchIds = recapEventLookupMatches.map(
    (match) => match.id,
  );
  const { data: recapEventRows, error: recapEventError } =
    recapEventLookupMatchIds.length === 0
      ? { data: [], error: null }
      : await deps.db
          .from("match_events")
          .select("match_id")
          .in("match_id", recapEventLookupMatchIds);

  if (recapEventError) {
    throw recapEventError;
  }

  const recapMatchIdsWithEvents = new Set(
    recapEventRows.map((event) => event.match_id),
  );
  const recapExcludedMatches = recapEventLookupMatches
    .filter((match) => !recapMatchIdsWithEvents.has(match.id))
    .map((match) => ({ matchId: match.id }));
  const recapBatch = recapEventLookupMatches
    .filter((match) => recapMatchIdsWithEvents.has(match.id))
    .slice(0, RECAP_BATCH_SIZE);

  const result: OrchestrateResult = {
    previews: {
      triggered: 0,
      skipped: previewCandidates.skippedCount,
    },
    lineups: {
      triggered: 0,
      no_url: 0,
      preview_triggered: 0,
      preview_no_url: 0,
      recap_triggered: 0,
      recap_no_url: 0,
    },
    recaps: {
      triggered: 0,
      skipped: recapCandidates.skippedCount,
    },
    remaining: { previews: 0, recaps: 0 },
  };

  const recapSkips: RecapSkipEntry[] = [];
  const timeBudgetSkipped = await processWithConcurrency({
    canStart: canStartGeneration,
    entries: [
      ...previewCandidates.eligibleMatches.map((match) => ({
        contentType: "preview" as const,
        match,
      })),
      ...recapBatch.map((match) => ({ contentType: "recap" as const, match })),
    ],
    processEntry: async ({ contentType, match }) => {
      const matchId = match.id;
      const competitionFamily =
        firstRelation(match.competition)?.family ?? null;
      try {
        const lineupOutcome = await deps.ingestLineups(
          matchId,
          competitionFamily,
        );
        if (lineupOutcome === "no_url") {
          result.lineups.no_url += 1;
          if (contentType === "preview") {
            result.lineups.preview_no_url += 1;
          } else {
            result.lineups.recap_no_url += 1;
          }
        } else {
          result.lineups.triggered += 1;
          if (contentType === "preview") {
            result.lineups.preview_triggered += 1;
          } else {
            result.lineups.recap_triggered += 1;
          }
        }
      } catch (error) {
        console.error("[orchestrate] lineup ingestion failed", {
          matchId,
          error,
        });
      }

      if (contentType === "preview") {
        try {
          await deps.fetchSourcedFacts?.(matchId, contentType);
          await deps.generateContent(matchId, contentType);
          await generateLeagueOneEnglishContent(deps, match, contentType);
          result.previews.triggered += 1;
        } catch (error) {
          console.error("[orchestrate] preview generation failed", {
            matchId,
            error,
          });
        }
        return;
      }

      try {
        await deps.fetchSourcedFacts?.(matchId, contentType);
        const generated = await deps.generateContent(matchId, contentType);
        if (generated?.status === "skipped") {
          result.recaps.skipped += 1;
          console.info("[orchestrate] recap generation skipped", {
            matchId,
          });
          if (generated.skipReason === "events_unavailable") {
            recapSkips.push({
              competitionFamily,
              matchId,
              reason: generated.skipReason,
            });
          }
          return;
        }

        await generateLeagueOneEnglishContent(deps, match, contentType);
        await notifyRecapReady(deps, matchId);
        result.recaps.triggered += 1;
      } catch (error) {
        console.error("[orchestrate] recap generation failed", {
          matchId,
          error,
        });
      }
    },
  });
  result.remaining = timeBudgetSkipped;

  if (
    (recapSkips.length > 0 ||
      recapExcludedMatches.length > 0 ||
      timeBudgetSkipped.previews > 0 ||
      timeBudgetSkipped.recaps > 0) &&
    deps.notifyRecapSkipped
  ) {
    try {
      await deps.notifyRecapSkipped({
        batchSize: RECAP_BATCH_SIZE,
        excludedMatches: recapExcludedMatches,
        matches: recapSkips,
        skippedCount: recapSkips.length,
        timeBudgetSkipped: {
          preview: timeBudgetSkipped.previews,
          recap: timeBudgetSkipped.recaps,
        },
      });
    } catch (error) {
      console.error("[orchestrate] recap skipped notification failed", {
        error,
      });
    }
  }

  return result;
}
