import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { previewDueUpperBound } from "@/lib/cron/preview-window";
import { getSupabaseServerClient } from "@/lib/db/server";

const MAX_LATE_LINEUP_MATCHES = 30;

type MatchRelation =
  | { kickoff_at: string; status: string }
  | Array<{ kickoff_at: string; status: string }>
  | null;

type PreviewContentRow = {
  generated_at: string;
  match: MatchRelation;
  match_id: string;
};

type LineupRow = {
  created_at: string;
  match_id: string;
  updated_at: string;
};

type PreviewCandidate = {
  generatedAt: string;
  kickoffAt: string;
  matchId: string;
};

function firstMatch(relation: MatchRelation) {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);

    const now = new Date();
    const db = getSupabaseServerClient();
    const { data: contentRows, error: contentError } = await db
      .from("match_content")
      .select(
        "match_id, generated_at, match:matches!inner(kickoff_at, status)",
      )
      .eq("content_type", "preview")
      .eq("language", "ja")
      .in("status", ["draft", "published"])
      .eq("match.status", "scheduled")
      .gt("match.kickoff_at", now.toISOString())
      .lt("match.kickoff_at", previewDueUpperBound(now));

    if (contentError) {
      throw contentError;
    }

    const candidateByMatchId = new Map<string, PreviewCandidate>();
    for (const content of (contentRows ?? []) as PreviewContentRow[]) {
      const match = firstMatch(content.match);
      if (!match) {
        continue;
      }

      const existing = candidateByMatchId.get(content.match_id);
      if (!existing || existing.generatedAt < content.generated_at) {
        candidateByMatchId.set(content.match_id, {
          generatedAt: content.generated_at,
          kickoffAt: match.kickoff_at,
          matchId: content.match_id,
        });
      }
    }

    const candidates = [...candidateByMatchId.values()];
    if (candidates.length === 0) {
      return NextResponse.json({ count: 0, match_ids: [], truncated: false });
    }

    const { data: lineupRows, error: lineupError } = await db
      .from("match_lineups")
      .select("match_id, created_at, updated_at")
      .in(
        "match_id",
        candidates.map((candidate) => candidate.matchId),
      );

    if (lineupError) {
      throw lineupError;
    }

    const latestLineupAtByMatchId = new Map<string, string>();
    for (const lineup of (lineupRows ?? []) as LineupRow[]) {
      const lineupAt =
        lineup.created_at > lineup.updated_at
          ? lineup.created_at
          : lineup.updated_at;
      const latestLineupAt = latestLineupAtByMatchId.get(lineup.match_id);
      if (!latestLineupAt || latestLineupAt < lineupAt) {
        latestLineupAtByMatchId.set(lineup.match_id, lineupAt);
      }
    }

    const lateCandidates = candidates
      .filter((candidate) => {
        const latestLineupAt = latestLineupAtByMatchId.get(candidate.matchId);
        return latestLineupAt !== undefined && latestLineupAt > candidate.generatedAt;
      })
      .sort(
        (left, right) =>
          left.kickoffAt.localeCompare(right.kickoffAt) ||
          left.matchId.localeCompare(right.matchId),
      );
    const truncated = lateCandidates.length > MAX_LATE_LINEUP_MATCHES;
    const matchIds = lateCandidates
      .slice(0, MAX_LATE_LINEUP_MATCHES)
      .map((candidate) => candidate.matchId);

    return NextResponse.json({
      count: matchIds.length,
      match_ids: matchIds,
      truncated,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.error("[matches-with-late-lineups] failed", error);
    return NextResponse.json(
      { error: "Failed to fetch matches with late lineups" },
      { status: 500 },
    );
  }
}
