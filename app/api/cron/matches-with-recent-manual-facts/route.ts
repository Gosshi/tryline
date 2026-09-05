import { NextResponse } from "next/server";

import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { getSupabaseServerClient } from "@/lib/db/server";

const DEFAULT_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 168;
const MAX_RECENT_MANUAL_FACT_MATCHES = 30;

type ContentType = "preview" | "recap";

type MatchRelation =
  | { kickoff_at: string; status: string }
  | Array<{ kickoff_at: string; status: string }>
  | null;

type ManualFactRow = {
  match: MatchRelation;
  match_id: string;
};

function isContentType(value: string | null): value is ContentType {
  return value === "preview" || value === "recap";
}

function getHours(value: string | null): number | null {
  if (value === null) {
    return DEFAULT_LOOKBACK_HOURS;
  }

  if (!/^\d+$/u.test(value)) {
    return null;
  }

  const hours = Number(value);
  return hours > 0 && hours <= MAX_LOOKBACK_HOURS ? hours : null;
}

function firstMatch(relation: MatchRelation) {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);

    const { searchParams } = new URL(request.url);
    const contentType = searchParams.get("content_type");
    if (!isContentType(contentType)) {
      return NextResponse.json(
        { error: "content_type must be preview or recap" },
        { status: 400 },
      );
    }

    const hours = getHours(searchParams.get("hours"));
    if (hours === null) {
      return NextResponse.json(
        { error: `hours must be between 1 and ${MAX_LOOKBACK_HOURS}` },
        { status: 400 },
      );
    }

    const requiredStatus = contentType === "recap" ? "finished" : "scheduled";
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const db = getSupabaseServerClient();
    const { data, error } = await db
      .from("match_sourced_facts")
      .select("match_id, match:matches!inner(kickoff_at, status)")
      .eq("content_type", contentType)
      .eq("metadata->>entry_method", "manual")
      .gte("fetched_at", cutoff)
      .eq("match.status", requiredStatus);

    if (error) {
      throw error;
    }

    const kickoffByMatchId = new Map<string, string>();
    for (const fact of (data ?? []) as unknown as ManualFactRow[]) {
      const match = firstMatch(fact.match);
      if (match) {
        kickoffByMatchId.set(fact.match_id, match.kickoff_at);
      }
    }

    const allMatchIds = [...kickoffByMatchId.entries()]
      .sort(([, leftKickoff], [, rightKickoff]) =>
        rightKickoff.localeCompare(leftKickoff),
      )
      .map(([matchId]) => matchId);
    const truncated = allMatchIds.length > MAX_RECENT_MANUAL_FACT_MATCHES;
    const matchIds = allMatchIds.slice(0, MAX_RECENT_MANUAL_FACT_MATCHES);

    return NextResponse.json({
      count: matchIds.length,
      match_ids: matchIds,
      truncated,
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.error("[matches-with-recent-manual-facts] failed", error);
    return NextResponse.json(
      { error: "Failed to fetch matches with recent manual facts" },
      { status: 500 },
    );
  }
}
