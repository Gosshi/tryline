import { NextResponse } from "next/server";

import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestWeeklyStandings } from "@/lib/ingestion/weekly-standings";
import { notifyStandingsIngestionIssue } from "@/lib/llm/notify";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const weeklyResult = await ingestWeeklyStandings();
    revalidatePublicData(PUBLIC_DATA_CACHE_TAGS.standings);

    for (const result of weeklyResult.results) {
      if (result.status === "failed") {
        await notifyStandingsIngestionIssue({
          competition: result.competitionSlug ?? result.family,
          error: result.error,
          status: "failed",
        });
      }
    }

    return NextResponse.json({
      duration_ms: Date.now() - startedAt,
      result: { weekly: weeklyResult },
      status: "ok",
    });
  } catch (error) {
    if (error instanceof CronUnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Failed to ingest standings.", error);

    return NextResponse.json(
      { error: "Failed to ingest standings" },
      { status: 500 },
    );
  }
}
