import type { Database } from "@/lib/db/types";
import type { ContentType } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const EXISTING_CONTENT_STATUSES = ["draft", "published"] as const;
const PREVIEW_WINDOW_START_HOURS = 47;
const PREVIEW_WINDOW_END_HOURS = 49;

type LineupIngestOutcome = "triggered" | "no_url";

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

export type RunOrchestrateDeps = {
  db: SupabaseClient<Database>;
  generateContent: (matchId: string, contentType: ContentType) => Promise<unknown>;
  ingestLineups: (matchId: string) => Promise<LineupIngestOutcome>;
  now?: Date;
};

function toIsoDate(base: Date, addHours: number) {
  return new Date(base.getTime() + addHours * 60 * 60 * 1000).toISOString();
}

async function getMatchIdsMissingContent(params: {
  db: SupabaseClient<Database>;
  status: "scheduled" | "finished";
  contentType: ContentType;
  kickoffGte?: string;
  kickoffLte?: string;
}) {
  let matchQuery = params.db.from("matches").select("id").eq("status", params.status);

  if (params.kickoffGte) {
    matchQuery = matchQuery.gte("kickoff_at", params.kickoffGte);
  }

  if (params.kickoffLte) {
    matchQuery = matchQuery.lte("kickoff_at", params.kickoffLte);
  }

  const { data: matches, error: matchError } = await matchQuery;

  if (matchError) {
    throw matchError;
  }

  const allMatchIds = matches.map((match) => match.id);

  if (allMatchIds.length === 0) {
    return {
      eligibleIds: [] as string[],
      skippedCount: 0,
    };
  }

  const { data: existingContent, error: contentError } = await params.db
    .from("match_content")
    .select("match_id")
    .eq("content_type", params.contentType)
    .in("status", [...EXISTING_CONTENT_STATUSES])
    .in("match_id", allMatchIds);

  if (contentError) {
    throw contentError;
  }

  const existingIds = new Set(existingContent.map((row) => row.match_id));
  const eligibleIds = allMatchIds.filter((matchId) => !existingIds.has(matchId));

  return {
    eligibleIds,
    skippedCount: allMatchIds.length - eligibleIds.length,
  };
}

export async function runOrchestrate(deps: RunOrchestrateDeps): Promise<OrchestrateResult> {
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
    previewCandidates.eligibleIds.map(async (matchId) => {
      try {
        const lineupOutcome = await deps.ingestLineups(matchId);
        if (lineupOutcome === "no_url") {
          result.lineups.no_url += 1;
        } else {
          result.lineups.triggered += 1;
        }
      } catch (error) {
        console.error("[orchestrate] lineup ingestion failed", { matchId, error });
      }

      try {
        await deps.generateContent(matchId, "preview");
        result.previews.triggered += 1;
      } catch (error) {
        console.error("[orchestrate] preview generation failed", { matchId, error });
      }
    }),
  );

  for (const matchId of recapCandidates.eligibleIds) {
    try {
      await deps.generateContent(matchId, "recap");
      result.recaps.triggered += 1;
    } catch (error) {
      console.error("[orchestrate] recap generation failed", { matchId, error });
    }
  }

  return result;
}
