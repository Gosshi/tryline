import type { Database } from "@/lib/db/types";
import type { ContentLanguage, ContentType } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;
const PREVIEW_WINDOW_START_HOURS = 12;
const PREVIEW_WINDOW_END_HOURS = 48;
const RECAP_BATCH_SIZE = 10;

type LineupIngestOutcome = "triggered" | "no_url";

type Relation<T> = T | T[] | null;

type MatchCandidate = {
  id: string;
  competition: Relation<{ family: string | null }>;
};

export type OrchestrateResult = {
  previews: {
    triggered: number;
    skipped: number;
  };
  lineups: {
    triggered: number;
    no_url: number;
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
  ) => Promise<{ status?: string } | void>;
  fetchSourcedFacts?: (
    matchId: string,
    contentType: ContentType,
  ) => Promise<void>;
  ingestLineups: (
    matchId: string,
    competitionFamily?: string | null,
  ) => Promise<LineupIngestOutcome>;
  now?: Date;
  sendPushNotification?: (info: PushMatchInfo) => Promise<void>;
};

function toIsoDate(base: Date, addHours: number) {
  return new Date(base.getTime() + addHours * 60 * 60 * 1000).toISOString();
}

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

export async function runOrchestrate(
  deps: RunOrchestrateDeps,
): Promise<OrchestrateResult> {
  const now = deps.now ?? new Date();

  const previewCandidates = await getMatchIdsMissingContent({
    db: deps.db,
    status: "scheduled",
    contentType: "preview",
    kickoffGte: toIsoDate(now, PREVIEW_WINDOW_START_HOURS),
    kickoffLte: toIsoDate(now, PREVIEW_WINDOW_END_HOURS),
  });

  const recapCandidates = await getMatchIdsMissingContent({
    db: deps.db,
    status: "finished",
    contentType: "recap",
    orderByKickoff: "desc",
  });

  const result: OrchestrateResult = {
    previews: {
      triggered: 0,
      skipped: previewCandidates.skippedCount,
    },
    lineups: {
      triggered: 0,
      no_url: 0,
    },
    recaps: {
      triggered: 0,
      skipped: recapCandidates.skippedCount,
    },
  };

  await Promise.all(
    previewCandidates.eligibleMatches.map(async (match) => {
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
        } else {
          result.lineups.triggered += 1;
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
    }),
  );

  for (const match of recapCandidates.eligibleMatches.slice(
    0,
    RECAP_BATCH_SIZE,
  )) {
    const matchId = match.id;
    try {
      await deps.fetchSourcedFacts?.(matchId, "recap");
      const generated = await deps.generateContent(matchId, "recap");
      if (generated?.status === "skipped") {
        result.recaps.skipped += 1;
        console.info("[orchestrate] recap generation skipped", {
          matchId,
        });
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

  return result;
}
