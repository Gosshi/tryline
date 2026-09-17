import {
  previewCandidateUpperBound,
  recapCandidateUpperBound,
} from "./content-windows";

import type { Database } from "@/lib/db/types";
import type { ContentLanguage, ContentType } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;
const ORCHESTRATE_TIME_BUDGET_MS = 210_000;
const PREVIEW_CONCURRENCY = 3;
const RECAP_BATCH_SIZE = 10;
const RECAP_EVENT_LOOKUP_CANDIDATES = 60;

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

  const { data: existingContent, error: contentError } = await params.db
    .from("match_content")
    .select("match_id")
    .eq("content_type", params.contentType)
    .eq("language", "ja")
    .in("status", [...EXISTING_CONTENT_STATUSES]);

  if (contentError) {
    throw contentError;
  }

  const existingIds = new Set(existingContent.map((row) => row.match_id));
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

async function processWithPreviewConcurrency<T>(params: {
  canStart: () => boolean;
  matches: T[];
  processMatch: (match: T) => Promise<void>;
}): Promise<number> {
  let nextMatchIndex = 0;
  let timeBudgetSkipped = 0;
  let stopped = false;

  const worker = async () => {
    while (!stopped && nextMatchIndex < params.matches.length) {
      if (!params.canStart()) {
        timeBudgetSkipped += params.matches.length - nextMatchIndex;
        nextMatchIndex = params.matches.length;
        stopped = true;
        return;
      }

      const match = params.matches[nextMatchIndex];
      if (match === undefined) {
        return;
      }
      nextMatchIndex += 1;
      await params.processMatch(match);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(PREVIEW_CONCURRENCY, params.matches.length) },
      worker,
    ),
  );

  return timeBudgetSkipped;
}

export async function runOrchestrate(
  deps: RunOrchestrateDeps,
): Promise<OrchestrateResult> {
  const getCurrentTime = deps.getCurrentTime ?? Date.now;
  const startedAt = getCurrentTime();
  const canStartGeneration = () =>
    getCurrentTime() - startedAt < ORCHESTRATE_TIME_BUDGET_MS;
  const now = deps.now ?? new Date();

  const previewCandidates = await getMatchIdsMissingContent({
    db: deps.db,
    status: "scheduled",
    contentType: "preview",
    kickoffGte: now.toISOString(),
    kickoffLt: previewCandidateUpperBound(now),
  });

  const recapCandidates = await getMatchIdsMissingContent({
    db: deps.db,
    status: "finished",
    contentType: "recap",
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
  };

  const previewTimeBudgetSkipped = await processWithPreviewConcurrency({
    canStart: canStartGeneration,
    matches: previewCandidates.eligibleMatches,
    processMatch: async (match) => {
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
          result.lineups.preview_no_url += 1;
        } else {
          result.lineups.triggered += 1;
          result.lineups.preview_triggered += 1;
        }
      } catch (error) {
        console.error("[orchestrate] lineup ingestion failed", {
          matchId,
          error,
        });
      }

      try {
        await deps.fetchSourcedFacts?.(matchId, "preview");
        await deps.generateContent(matchId, "preview");
        await generateLeagueOneEnglishContent(deps, match, "preview");
        result.previews.triggered += 1;
      } catch (error) {
        console.error("[orchestrate] preview generation failed", {
          matchId,
          error,
        });
      }
    },
  });

  const recapSkips: RecapSkipEntry[] = [];
  let recapTimeBudgetSkipped = 0;

  for (const [index, match] of recapBatch.entries()) {
    if (!canStartGeneration()) {
      recapTimeBudgetSkipped = recapBatch.length - index;
      break;
    }

    const matchId = match.id;
    const competitionFamily = firstRelation(match.competition)?.family ?? null;
    try {
      const lineupOutcome = await deps.ingestLineups(
        matchId,
        competitionFamily,
      );
      if (lineupOutcome === "no_url") {
        result.lineups.no_url += 1;
        result.lineups.recap_no_url += 1;
      } else {
        result.lineups.triggered += 1;
        result.lineups.recap_triggered += 1;
      }
    } catch (error) {
      console.error("[orchestrate] lineup ingestion failed", {
        matchId,
        error,
      });
    }

    try {
      await deps.fetchSourcedFacts?.(matchId, "recap");
      const generated = await deps.generateContent(matchId, "recap");
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
        continue;
      }

      await generateLeagueOneEnglishContent(deps, match, "recap");
      await notifyRecapReady(deps, matchId);
      result.recaps.triggered += 1;
    } catch (error) {
      console.error("[orchestrate] recap generation failed", {
        matchId,
        error,
      });
    }
  }

  if (
    (recapSkips.length > 0 ||
      recapExcludedMatches.length > 0 ||
      previewTimeBudgetSkipped > 0 ||
      recapTimeBudgetSkipped > 0) &&
    deps.notifyRecapSkipped
  ) {
    try {
      await deps.notifyRecapSkipped({
        batchSize: RECAP_BATCH_SIZE,
        excludedMatches: recapExcludedMatches,
        matches: recapSkips,
        skippedCount: recapSkips.length,
        timeBudgetSkipped: {
          preview: previewTimeBudgetSkipped,
          recap: recapTimeBudgetSkipped,
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
