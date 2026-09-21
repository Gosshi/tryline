import { NextResponse } from "next/server";

import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestWeeklyStandings } from "@/lib/ingestion/weekly-standings";
import { calculateLatestTop14Standings } from "@/scripts/calculate-standings";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const [weeklyResult, top14Result] = await Promise.allSettled([
      ingestWeeklyStandings(),
      calculateLatestTop14Standings(),
    ]);

    if (weeklyResult.status === "fulfilled" || top14Result.status === "fulfilled") {
      revalidatePublicData(PUBLIC_DATA_CACHE_TAGS.standings);
    }

    if (weeklyResult.status === "rejected") {
      throw weeklyResult.reason;
    }
    if (top14Result.status === "rejected") {
      throw top14Result.reason;
    }

    return NextResponse.json({
      duration_ms: Date.now() - startedAt,
      result: { top14: top14Result.value, weekly: weeklyResult.value },
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
