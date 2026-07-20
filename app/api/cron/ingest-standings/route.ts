import { NextResponse } from "next/server";

import {
  PUBLIC_DATA_CACHE_TAGS,
  revalidatePublicData,
} from "@/lib/cache/public-data";
import { assertCronAuthorized, CronUnauthorizedError } from "@/lib/cron/auth";
import { ingestWeeklyStandings } from "@/lib/ingestion/weekly-standings";

export const maxDuration = 300;

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    assertCronAuthorized(request);

    const result = await ingestWeeklyStandings();

    revalidatePublicData(PUBLIC_DATA_CACHE_TAGS.standings);

    return NextResponse.json({
      duration_ms: Date.now() - startedAt,
      result,
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
